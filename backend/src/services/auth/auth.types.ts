import { z } from "zod";

export type AuthenticatedSession = {
  privyUserId: string;
  sessionId: string;
};

export type LinkedAccountLabel = "google" | "github" | "email";

export type AuthMeAgentWallet = {
  sui_address: string;
  funded: boolean;
};

export type AuthMeData = {
  privy_user_id: string;
  email: string | null;
  linked_accounts: LinkedAccountLabel[];
  agent_wallet: AuthMeAgentWallet | null;
};

export const logoutBodySchema = z.object({}).optional();
