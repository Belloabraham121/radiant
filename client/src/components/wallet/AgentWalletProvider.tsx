"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCreateWallet as useCreateEthereumWallet } from "@privy-io/react-auth";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { useCreateWallet as useCreateExtendedChainWallet } from "@privy-io/react-auth/extended-chains";
import { useCreateWallet as useCreateSolanaWallet } from "@privy-io/react-auth/solana";
import { fetchAuthMe, type AuthMeData } from "@/lib/auth-api";
import { loadAgentChainBalance } from "@/lib/agent-wallet-balances";
import {
  getDefaultAgentChainId,
  getEnabledAgentChainIds,
  privyChainTypeFor,
  type AgentChainId,
} from "@/lib/agent-chains";
import { getChainMeta } from "@/lib/chain-meta";
import {
  ensureAgentChainWallet,
  type ChainWalletCreators,
} from "@/lib/ensure-agent-chain-wallet";
import type { AuthMeAgentWallet } from "@/lib/auth-api";

export type AgentWalletStatus = "idle" | "loading" | "ready" | "error";

export type ChainWalletState = {
  chainId: AgentChainId;
  label: string;
  nativeSymbol: string;
  address: string | null;
  balanceDisplay: number | null;
  funded: boolean;
  signerAdded: boolean;
};

export type AgentWalletContextValue = {
  status: AgentWalletStatus;
  /** True only while creating a wallet or attaching the server signer. */
  provisioning: boolean;
  /** True while native balances are being fetched (returning users). */
  balancesLoading: boolean;
  defaultChainId: AgentChainId;
  enabledChains: AgentChainId[];
  wallets: ChainWalletState[];
  /** Default-chain wallet (sidebar / primary UI). */
  primaryWallet: ChainWalletState | null;
  /** @deprecated Prefer `primaryWallet` or `wallets`. */
  suiAddress: string | null;
  /** @deprecated Prefer `primaryWallet.balanceDisplay`. */
  balanceSui: number | null;
  /** @deprecated Prefer `primaryWallet.funded`. */
  funded: boolean;
  /** @deprecated Prefer per-chain `signerAdded`. */
  signerAdded: boolean;
  error: string | null;
  /** Re-fetch native balances only (no wallet reprovisioning). */
  refreshBalancesOnly: () => Promise<void>;
  /** Full retry — balances when ready, otherwise reprovision wallets. */
  refresh: () => void;
  getWallet: (chainId: AgentChainId) => ChainWalletState | undefined;
};

const AgentWalletContext = createContext<AgentWalletContextValue | null>(null);

function onboardingErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Could not set up your agent wallet. Please try again.";
}

function emptyChainWallet(chainId: AgentChainId): ChainWalletState {
  const meta = getChainMeta(chainId);
  return {
    chainId,
    label: meta.label,
    nativeSymbol: meta.nativeSymbol,
    address: null,
    balanceDisplay: null,
    funded: false,
    signerAdded: false,
  };
}

function lookupRegisteredWallet(
  me: AuthMeData,
  chainId: AgentChainId,
): AuthMeAgentWallet | null {
  const privyChainType = privyChainTypeFor(chainId);
  return (
    me.agent_wallets.find((w) => w.chain_type === privyChainType) ??
    (me.agent_wallet?.chain_type === privyChainType ? me.agent_wallet : null)
  );
}

function buildWalletsFromMe(
  me: AuthMeData,
  chainIds: AgentChainId[],
): ChainWalletState[] {
  return chainIds.map((chainId) => {
    const registered = lookupRegisteredWallet(me, chainId);
    return registered?.address ? fromRegistered(chainId, registered) : emptyChainWallet(chainId);
  });
}

function isFullyRegistered(me: AuthMeData, chainIds: AgentChainId[]): boolean {
  return chainIds.every((chainId) => Boolean(lookupRegisteredWallet(me, chainId)?.address));
}

function fromRegistered(
  chainId: AgentChainId,
  registered: AuthMeAgentWallet,
): ChainWalletState {
  const meta = getChainMeta(chainId);
  return {
    chainId,
    label: meta.label,
    nativeSymbol: meta.nativeSymbol,
    address: registered.address,
    balanceDisplay: null,
    funded: registered.funded,
    signerAdded: registered.signer_added,
  };
}

export function AgentWalletProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { createWallet: createEthereumWallet } = useCreateEthereumWallet();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();
  const { createWallet: createExtendedChainWallet } = useCreateExtendedChainWallet();
  const { addSigners } = useSigners();

  const [status, setStatus] = useState<AgentWalletStatus>("idle");
  const [provisioning, setProvisioning] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [wallets, setWallets] = useState<ChainWalletState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const onboardedUserIdRef = useRef<string | null>(null);
  const balancesLoadedRef = useRef(false);

  const userId = user?.id ?? null;
  const sessionActive = ready && authenticated && userId !== null;
  const enabledChains = useMemo(() => getEnabledAgentChainIds(), []);
  const defaultChainId = useMemo(() => getDefaultAgentChainId(), []);

  const walletCreators = useMemo<ChainWalletCreators>(
    () => ({
      sui: async () => createExtendedChainWallet({ chainType: "sui" }),
      ethereum: async () => createEthereumWallet(),
      solana: async () => createSolanaWallet(),
    }),
    [createEthereumWallet, createExtendedChainWallet, createSolanaWallet],
  );

  const refreshBalances = useCallback(async (chainStates: ChainWalletState[]) => {
    const updated = await Promise.all(
      chainStates.map(async (wallet) => {
        if (!wallet.address) return wallet;
        try {
          const balance = await loadAgentChainBalance(wallet.chainId);
          return {
            ...wallet,
            balanceDisplay: balance.balanceDisplay,
            nativeSymbol: balance.nativeSymbol,
            funded: balance.funded,
          };
        } catch {
          return wallet;
        }
      }),
    );
    setWallets(updated);
    balancesLoadedRef.current = true;
    return updated;
  }, []);

  const refreshBalancesOnly = useCallback(async () => {
    if (wallets.length === 0) return;
    await refreshBalances(wallets);
  }, [refreshBalances, wallets]);

  const ensureAgentWallet = useCallback(
    async (me: AuthMeData) => {
      if (!authenticated || !user) return [];

      const provisioned: ChainWalletState[] = [];

      for (const chainId of enabledChains) {
        const registered = await ensureAgentChainWallet({
          user,
          me,
          chainId,
          creators: walletCreators,
          addSigners,
        });
        provisioned.push(fromRegistered(chainId, registered));
      }

      if (provisioned.length === 0) {
        throw new Error("No agent wallets were provisioned.");
      }

      setWallets(provisioned);
      return provisioned;
    },
    [addSigners, authenticated, enabledChains, user, walletCreators],
  );

  const runOnboarding = useCallback(
    async (trigger: "auto" | "manual" = "auto") => {
      if (!authenticated || !userId) {
        setStatus("idle");
        return;
      }

      if (
        trigger === "auto" &&
        onboardedUserIdRef.current === userId &&
        balancesLoadedRef.current
      ) {
        return;
      }

      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const runId = ++runIdRef.current;
      if (trigger === "manual") setError(null);
      let syncDeferred = false;

      try {
        if (trigger === "manual" && status === "ready" && wallets.length > 0) {
          setBalancesLoading(true);
          await refreshBalances(wallets);
          if (runId !== runIdRef.current) return;
          setError(null);
          setStatus("ready");
          return;
        }

        const me = await fetchAuthMe();
        if (runId !== runIdRef.current) return;

        const returningUser = trigger === "auto" && isFullyRegistered(me, enabledChains);
        const hydrated = buildWalletsFromMe(me, enabledChains);

        if (returningUser) {
          setWallets(hydrated);
          setProvisioning(false);
          setStatus("ready");
          onboardedUserIdRef.current = userId;
        } else if (trigger === "auto") {
          setWallets([]);
          setProvisioning(true);
          setStatus("loading");
        } else {
          setProvisioning(true);
          setStatus("loading");
        }

        if (!ready || !user) {
          if (returningUser) {
            setBalancesLoading(true);
            syncDeferred = true;
          }
          return;
        }

        if (returningUser) {
          setBalancesLoading(true);
        } else {
          setProvisioning(true);
          setStatus("loading");
        }

        const provisioned = await ensureAgentWallet(me);
        if (runId !== runIdRef.current) return;

        setProvisioning(false);
        await refreshBalances(provisioned);
        if (runId !== runIdRef.current) return;

        onboardedUserIdRef.current = userId;
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (runId !== runIdRef.current) return;
        setError(onboardingErrorMessage(err));
        setStatus("error");
        setProvisioning(false);
      } finally {
        inFlightRef.current = false;
        if (!syncDeferred) {
          setBalancesLoading(false);
        }
      }
    },
    [
      authenticated,
      enabledChains,
      ensureAgentWallet,
      ready,
      refreshBalances,
      status,
      user,
      userId,
      wallets,
    ],
  );

  const refresh = useCallback(() => {
    void runOnboarding("manual");
  }, [runOnboarding]);

  useEffect(() => {
    if (!authenticated || !userId) {
      onboardedUserIdRef.current = null;
      balancesLoadedRef.current = false;
      setProvisioning(false);
      setBalancesLoading(false);
      return;
    }

    void runOnboarding("auto");
  }, [authenticated, ready, runOnboarding, userId]);

  const displayWallets = useMemo(
    () =>
      sessionActive && wallets.length > 0
        ? wallets
        : enabledChains.map((chainId) => emptyChainWallet(chainId)),
    [enabledChains, sessionActive, wallets],
  );

  const displayPrimaryWallet = useMemo(
    () =>
      displayWallets.find((w) => w.chainId === defaultChainId) ?? displayWallets[0] ?? null,
    [defaultChainId, displayWallets],
  );

  const displaySuiWallet = useMemo(
    () => displayWallets.find((w) => w.chainId === "sui") ?? null,
    [displayWallets],
  );

  const getWallet = useCallback(
    (chainId: AgentChainId) => displayWallets.find((w) => w.chainId === chainId),
    [displayWallets],
  );

  const value = useMemo<AgentWalletContextValue>(
    () => ({
      status: sessionActive ? status : "idle",
      provisioning: sessionActive ? provisioning : false,
      balancesLoading: sessionActive ? balancesLoading : false,
      defaultChainId,
      enabledChains,
      wallets: displayWallets,
      primaryWallet: displayPrimaryWallet,
      suiAddress: displaySuiWallet?.address ?? null,
      balanceSui: displaySuiWallet?.balanceDisplay ?? null,
      funded: displayPrimaryWallet?.funded ?? false,
      signerAdded: displayPrimaryWallet?.signerAdded ?? false,
      error: sessionActive ? error : null,
      refreshBalancesOnly,
      refresh,
      getWallet,
    }),
    [
      defaultChainId,
      displayPrimaryWallet,
      displaySuiWallet,
      displayWallets,
      enabledChains,
      error,
      getWallet,
      refresh,
      refreshBalancesOnly,
      balancesLoading,
      provisioning,
      sessionActive,
      status,
    ],
  );

  return (
    <AgentWalletContext.Provider value={value}>{children}</AgentWalletContext.Provider>
  );
}

export function useAgentWallet(): AgentWalletContextValue {
  const ctx = useContext(AgentWalletContext);
  if (!ctx) {
    throw new Error("useAgentWallet must be used within AgentWalletProvider");
  }
  return ctx;
}
