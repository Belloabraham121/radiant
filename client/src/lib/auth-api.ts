import { apiFetch, ApiError } from "./api";

export type AuthMeAgentWallet = {
  sui_address: string;
  funded: boolean;
  signer_added: boolean;
};

export type AuthMeData = {
  privy_user_id: string;
  email: string | null;
  linked_accounts: Array<"google" | "github" | "email">;
  agent_wallet: AuthMeAgentWallet | null;
};

/** @deprecated Use `ApiError` from `@/lib/api`. */
export { ApiError as AuthApiError };

/** Upsert local user row after Privy login. Requires `privy-token` cookie. */
export async function fetchAuthMe(): Promise<AuthMeData> {
  return apiFetch<AuthMeData>("/api/v1/auth/me");
}
