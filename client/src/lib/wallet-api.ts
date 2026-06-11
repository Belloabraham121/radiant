import { apiFetch } from "./api";
import type { AuthMeAgentWallet } from "./auth-api";

export type RegisterAgentWalletInput = {
  chain_type?: string;
  privy_wallet_id: string;
  address: string;
  /** Legacy alias — sent when chain_type is sui. */
  sui_address?: string;
  signer_added?: boolean;
};

export type WalletBalanceData = {
  chain_id: string;
  address: string;
  balance_atomic: string;
  balance_display: number;
  native_symbol: string;
  coin_type?: string;
  funded: boolean;
  sui_address: string;
  balance_mist: string;
  balance_sui: number;
};

export async function registerAgentWallet(
  input: RegisterAgentWalletInput,
): Promise<AuthMeAgentWallet & { privy_wallet_id: string; signer_added: boolean }> {
  const chainType = input.chain_type ?? "sui";
  const body = {
    chain_type: chainType,
    privy_wallet_id: input.privy_wallet_id,
    address: input.address,
    ...(chainType === "sui"
      ? { sui_address: input.sui_address ?? input.address }
      : {}),
    signer_added: input.signer_added,
  };

  return apiFetch("/api/v1/auth/register-wallet", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchWalletBalances(
  chainId?: string,
): Promise<WalletBalanceData> {
  const query =
    chainId && chainId.length > 0
      ? `?chain=${encodeURIComponent(chainId)}`
      : "";
  return apiFetch<WalletBalanceData>(`/api/v1/wallets/balances${query}`);
}
