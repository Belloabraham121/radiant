import { apiFetch } from "./api";
import type { AuthMeAgentWallet } from "./auth-api";

export type RegisterAgentWalletInput = {
  privy_wallet_id: string;
  sui_address: string;
  signer_added?: boolean;
};

export type WalletBalanceData = {
  sui_address: string;
  balance_mist: string;
  balance_sui: number;
  coin_type: string;
  funded: boolean;
};

export async function registerAgentWallet(
  input: RegisterAgentWalletInput,
): Promise<AuthMeAgentWallet & { privy_wallet_id: string; signer_added: boolean }> {
  return apiFetch("/api/v1/auth/register-wallet", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchWalletBalances(): Promise<WalletBalanceData> {
  return apiFetch<WalletBalanceData>("/api/v1/wallets/balances");
}
