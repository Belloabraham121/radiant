import { apiFetch, ApiError } from "./api";

export type AuthMeAgentWallet = {
  chain_type: string;
  address: string;
  funded: boolean;
  signer_added: boolean;
  sui_address?: string;
};

export type AuthMeData = {
  privy_user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_seed: string;
  avatar_style: string;
  member_since: string;
  linked_accounts: Array<"google" | "github" | "email">;
  agent_wallet: AuthMeAgentWallet | null;
  agent_wallets: AuthMeAgentWallet[];
};

/** @deprecated Use `ApiError` from `@/lib/api`. */
export { ApiError as AuthApiError };

/** Upsert local user row after Privy login. Requires `privy-token` cookie. */
export async function fetchAuthMe(): Promise<AuthMeData> {
  return apiFetch<AuthMeData>("/api/v1/auth/me");
}

/** Clear Radiant session cookies. Safe to call when already logged out. */
export async function logoutSession(): Promise<void> {
  await apiFetch<{ logged_out: boolean }>("/api/v1/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
