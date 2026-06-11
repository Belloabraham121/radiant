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
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import { fetchAuthMe } from "@/lib/auth-api";
import { findPrivySuiWallet } from "@/lib/privy-wallet";
import { getSignerQuorumId, getSuiPolicyId } from "@/lib/privy-config";
import { fetchWalletBalances, registerAgentWallet } from "@/lib/wallet-api";

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
  const { createWallet } = useCreateWallet();
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

  const loadBalances = useCallback(async (address: string) => {
    const balances = await fetchWalletBalances();
    if (balances.sui_address !== address) {
      setSuiAddress(balances.sui_address);
    }
    setBalanceSui(balances.balance_sui);
    setFunded(balances.funded);
  }, []);

  const ensureAgentWallet = useCallback(async () => {
    const currentUser = userRef.current;
    if (!authenticated || !currentUser) return;

    const quorumId = getSignerQuorumId();
    if (!quorumId) {
      throw new Error("NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID is not configured.");
    }

    const me = await fetchAuthMe();
    let wallet = findPrivySuiWallet(currentUser);

    if (!wallet) {
      const created = await createWallet({ chainType: "sui" });
      const privyWalletId = created.wallet.id;
      if (!privyWalletId) {
        throw new Error("Privy Sui wallet is missing a server wallet ID.");
      }
      wallet = {
        privyWalletId,
        address: created.wallet.address,
      };
    }

    let hasSigner = me.agent_wallet?.signer_added ?? false;

    if (!hasSigner) {
      const policyId = getSuiPolicyId();
      await addSigners({
        address: wallet.address,
        signers: [
          {
            signerId: quorumId,
            policyIds: policyId ? [policyId] : [],
          },
        ],
      });
      hasSigner = true;
    }

    const registered = await registerAgentWallet({
      privy_wallet_id: wallet.privyWalletId,
      sui_address: wallet.address,
      signer_added: hasSigner,
    });

    setSuiAddress(registered.sui_address);
    setSignerAdded(registered.signer_added);
    setFunded(registered.funded);

    await loadBalances(registered.sui_address);
  }, [addSigners, authenticated, createWallet, loadBalances]);

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
          await loadBalances(suiAddressRef.current);
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
