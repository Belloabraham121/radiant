import type { AgentTransactionCategory } from "../agent-transaction/agent-transaction.types.js";
import type { ChainId } from "../chains/types.js";

/** Canonical app-facing action names (stable API for UI + call_app_action). */
export const APP_ACTION_NAMES = [
  "swap",
  "flash_loan",
  "stake",
  "unstake",
  "deposit",
  "withdraw",
  "provision_manager",
  "place_limit_order",
  "place_market_order",
  "cancel_order",
  "cancel_orders",
  "cancel_all_orders",
  "modify_order",
  "withdraw_settled",
  "submit_proposal",
  "vote",
  "transfer",
] as const;

export type AppActionName = (typeof APP_ACTION_NAMES)[number];

export type AppActionProtocol = "deepbook" | "transfer" | "generic";

/** Registry metadata for one app action. */
export type AppActionDefinition = {
  name: AppActionName;
  description: string;
  protocol: AppActionProtocol;
  /** Default chain when callers omit chain_id. */
  default_chain_id: ChainId;
  /** Underlying execute_transaction action string. */
  execute_action: string;
  /** Ledger category derived from execute_action. */
  category: AgentTransactionCategory;
};

/** JSON-schema-friendly param field description (Phase 6 action schema). */
export type AppActionParamField = {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required?: boolean;
  description?: string;
};

export type AppActionParamSchemaDoc = {
  fields: AppActionParamField[];
};
