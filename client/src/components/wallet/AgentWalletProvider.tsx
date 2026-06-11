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
import {
  getDefaultAgentChainId,
  getEnabledAgentChainIds,
  type AgentChainId,
} from "@/lib/agent-chains";
import {
  ensureAgentChainWallet,
  type ChainWalletCreators,
} from "@/lib/ensure-agent-chain-wallet";
import { fetchWalletBalances } from "@/lib/wallet-api";

export type AgentWalletStatus = "idle" | "loading" | "ready" | "error";

export type AgentWalletContextValue = {
  status: AgentWalletStatus;
  suiAddress: string | null;
  balanceSui: number | null;
  funded: boolean;
  signerAdded: boolean;
  error: string | null;
  refresh: () => void;
};

const AgentWalletContext = createContext<AgentWalletContextValue | null>(null);

function onboardingErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Could not set up your agent wallet. Please try again.";
}

export function AgentWalletProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { createWallet: createEthereumWallet } = useCreateEthereumWallet();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();
  const { createWallet: createExtendedChainWallet } = useCreateExtendedChainWallet();
  const { addSigners } = useSigners();

  const [status, setStatus] = useState<AgentWalletStatus>("idle");
  const [suiAddress, setSuiAddress] = useState<string | null>(null);
  const [balanceSui, setBalanceSui] = useState<number | null>(null);
  const [funded, setFunded] = useState(false);
  const [signerAdded, setSignerAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const onboardedUserIdRef = useRef<string | null>(null);
  const userRef = useRef(user);
  const statusRef = useRef(status);
  const suiAddressRef = useRef(suiAddress);
  userRef.current = user;
  statusRef.current = status;
  suiAddressRef.current = suiAddress;

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

  const loadBalances = useCallback(
    async (address: string, chainId: AgentChainId = defaultChainId) => {
      if (chainId !== "sui") {
        return;
      }

      const balances = await fetchWalletBalances(chainId);
      if (balances.sui_address !== address) {
        setSuiAddress(balances.sui_address);
      }
      setBalanceSui(balances.balance_sui);
      setFunded(balances.funded);
    },
    [defaultChainId],
  );

  const ensureAgentWallet = useCallback(async () => {
    const currentUser = userRef.current;
    if (!authenticated || !currentUser) return;

    const me = await fetchAuthMe();
    let primarySui:
      | {
          address: string;
          signer_added: boolean;
          funded: boolean;
        }
      | null = null;

    for (const chainId of enabledChains) {
      const registered = await ensureAgentChainWallet({
        user: currentUser,
        me,
        chainId,
        creators: walletCreators,
        addSigners,
      });

      if (chainId === "sui") {
        primarySui = {
          address: registered.address,
          signer_added: registered.signer_added,
          funded: registered.funded,
        };
      }
    }

    if (primarySui) {
      setSuiAddress(primarySui.address);
      setSignerAdded(primarySui.signer_added);
      setFunded(primarySui.funded);
      await loadBalances(primarySui.address, "sui");
      return;
    }

    if (defaultChainId === "sui") {
      throw new Error("Sui agent wallet was not provisioned.");
    }
  }, [addSigners, authenticated, defaultChainId, enabledChains, loadBalances, walletCreators]);

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
        if (
          trigger === "manual" &&
          statusRef.current === "ready" &&
          suiAddressRef.current
        ) {
          await loadBalances(suiAddressRef.current, "sui");
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
    [authenticated, ensureAgentWallet, loadBalances, ready],
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
      setSuiAddress(null);
      setBalanceSui(null);
      setFunded(false);
      setSignerAdded(false);
      setError(null);
      return;
    }

    if (onboardedUserIdRef.current === userId) {
      return;
    }

    void runOnboardingRef.current("auto");
  }, [authenticated, ready, userId]);

  const value = useMemo<AgentWalletContextValue>(
    () => ({
      status,
      suiAddress,
      balanceSui,
      funded,
      signerAdded,
      error,
      refresh,
    }),
    [balanceSui, error, funded, refresh, signerAdded, status, suiAddress],
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
