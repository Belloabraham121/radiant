import { apiFetch } from "./api";
import type { AuthMeAgentWallet } from "./auth-api";

export type RegisterAgentWalletInput = {
  privy_wallet_id: string;
  sui_address: string;
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
  return apiFetch("/api/v1/auth/register-wallet", {
    method: "POST",
    body: JSON.stringify(input),
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
