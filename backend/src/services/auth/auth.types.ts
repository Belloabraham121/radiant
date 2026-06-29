import { z } from "zod";
import type { FeatureFlags } from "../../config/features.js";
import type { AgentPermissions } from "../agent/agent-permissions.types.js";
import type { ChainId } from "../chains/types.js";

export type AuthenticatedSession = {
  privyUserId: string;
  sessionId: string;
};

export type LinkedAccountLabel = "google" | "github" | "email";

export type AuthMeAgentWallet = {
  chain_type: ChainId;
  address: string;
  funded: boolean;
  signer_added: boolean;
  /** Legacy alias when chain_type is sui. */
  sui_address?: string;
};

export type AuthMeData = {
  privy_user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_seed: string;
  avatar_style: string;
  member_since: string;
  linked_accounts: LinkedAccountLabel[];
  /** Primary wallet on the default agent chain (legacy field). */
  agent_wallet: AuthMeAgentWallet | null;
  agent_wallets: AuthMeAgentWallet[];
  agent_permissions: AgentPermissions;
  features: FeatureFlags;
};

export const logoutBodySchema = z.object({}).optional();
