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
import { fetchAuthMe } from "@/lib/auth-api";
import { loadAgentChainBalance } from "@/lib/agent-wallet-balances";
import {
  getDefaultAgentChainId,
  getEnabledAgentChainIds,
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
  const [wallets, setWallets] = useState<ChainWalletState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const onboardedUserIdRef = useRef<string | null>(null);
  const userRef = useRef(user);
  const statusRef = useRef(status);
  const walletsRef = useRef(wallets);
  userRef.current = user;
  statusRef.current = status;
  walletsRef.current = wallets;

  const userId = user?.id ?? null;
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
    return updated;
  }, []);

  const ensureAgentWallet = useCallback(async () => {
    const currentUser = userRef.current;
    if (!authenticated || !currentUser) return;

    const me = await fetchAuthMe();
    const provisioned: ChainWalletState[] = [];

    for (const chainId of enabledChains) {
      const registered = await ensureAgentChainWallet({
        user: currentUser,
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
    await refreshBalances(provisioned);
  }, [addSigners, authenticated, enabledChains, refreshBalances, walletCreators]);

  const runOnboarding = useCallback(
    async (trigger: "auto" | "manual" = "auto") => {
      if (!ready || !authenticated) {
        setStatus("idle");
        return;
      }

      const activeUserId = userRef.current?.id ?? null;
      if (trigger === "auto" && activeUserId && onboardedUserIdRef.current === activeUserId) {
        return;
      }

      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const runId = ++runIdRef.current;
      setStatus("loading");
      if (trigger === "manual") setError(null);

      try {
        if (trigger === "manual" && statusRef.current === "ready" && walletsRef.current.length > 0) {
          await refreshBalances(walletsRef.current);
          if (runId !== runIdRef.current) return;
          setError(null);
          setStatus("ready");
          return;
        }

        await ensureAgentWallet();
        if (runId !== runIdRef.current) return;
        onboardedUserIdRef.current = activeUserId;
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (runId !== runIdRef.current) return;
        setError(onboardingErrorMessage(err));
        setStatus("error");
      } finally {
        inFlightRef.current = false;
      }
    },
    [authenticated, ensureAgentWallet, ready, refreshBalances],
  );

  const runOnboardingRef = useRef(runOnboarding);
  runOnboardingRef.current = runOnboarding;

  const refresh = useCallback(() => {
    void runOnboardingRef.current("manual");
  }, []);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !userId) {
      onboardedUserIdRef.current = null;
      setStatus("idle");
      setWallets([]);
      setError(null);
      return;
    }

    if (onboardedUserIdRef.current === userId) {
      return;
    }

    void runOnboardingRef.current("auto");
  }, [authenticated, ready, userId]);

  const primaryWallet = useMemo(
    () => wallets.find((w) => w.chainId === defaultChainId) ?? wallets[0] ?? null,
    [defaultChainId, wallets],
  );

  const suiWallet = useMemo(
    () => wallets.find((w) => w.chainId === "sui") ?? null,
    [wallets],
  );

  const getWallet = useCallback(
    (chainId: AgentChainId) => wallets.find((w) => w.chainId === chainId),
    [wallets],
  );

  const value = useMemo<AgentWalletContextValue>(
    () => ({
      status,
      defaultChainId,
      enabledChains,
      wallets:
        wallets.length > 0
          ? wallets
          : enabledChains.map((chainId) => emptyChainWallet(chainId)),
      primaryWallet,
      suiAddress: suiWallet?.address ?? null,
      balanceSui: suiWallet?.balanceDisplay ?? null,
      funded: primaryWallet?.funded ?? false,
      signerAdded: primaryWallet?.signerAdded ?? false,
      error,
      refresh,
      getWallet,
    }),
    [defaultChainId, enabledChains, error, getWallet, primaryWallet, refresh, status, suiWallet, wallets],
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
