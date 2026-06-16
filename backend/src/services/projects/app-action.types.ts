import type { AgentTransactionCategory } from "../agent-transaction/agent-transaction.types.js";
import type { ChainId, TxResult } from "../chains/types.js";
import type { PendingTransaction } from "../agent/agent.types.js";
import type { PinnedAppScope } from "./pinned-app-scope.types.js";

/** On-chain action names that route through the transaction pipeline. */
export const ONCHAIN_ACTION_NAMES = [
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
  // DeepBook Margin
  "margin_deposit",
  "margin_withdraw",
  "margin_borrow",
  "margin_repay",
  "margin_place_limit_order",
  "margin_place_market_order",
  "margin_cancel_order",
  "margin_modify_order",
  "margin_place_reduce_only_limit_order",
  "margin_place_reduce_only_market_order",
  "margin_cancel_orders",
  "margin_cancel_all_orders",
  "margin_withdraw_settled",
  "margin_withdraw_settled_permissionless",
  "margin_update_price",
  "margin_stake",
  "margin_unstake",
  "margin_submit_proposal",
  "margin_vote",
  "margin_claim_rebate",
  "margin_supply_pool",
  "margin_withdraw_pool",
  "margin_tpsl_add",
  "margin_tpsl_cancel",
  "margin_tpsl_cancel_all",
  // DeepBook Predict
  "predict_deposit",
  "predict_withdraw",
  "predict_mint",
  "predict_redeem",
  "predict_mint_range",
  "predict_redeem_range",
  "predict_supply",
  "predict_lp_withdraw",
] as const;

export type OnchainActionName = (typeof ONCHAIN_ACTION_NAMES)[number];

/**
 * App action name — either a known on-chain action or any custom app-local action string.
 * On-chain actions route through the tx pipeline (quote → approval → execute).
 * App-local actions (e.g. "log_workout", "update_reps") delegate to the preview.
 */
export type AppActionName = OnchainActionName | (string & {});

/** @deprecated Use ONCHAIN_ACTION_NAMES. Kept for backward compat in tool schema. */
export const APP_ACTION_NAMES = ONCHAIN_ACTION_NAMES;

export function isOnchainAction(action: string): action is OnchainActionName {
  return (ONCHAIN_ACTION_NAMES as readonly string[]).includes(action);
}

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

/** Who initiated the app action (for analytics, live stream, and audit). */
export type AppActionSource = "ui" | "agent" | "external";

/** Execution context for project/installation-scoped app actions. */
export type AppActionContext = {
  privyUserId: string;
  projectId?: string;
  installationId?: string;
  sessionId?: string;
  messageId?: string;
  source: AppActionSource;
  /** Override default chain from action registry. */
  chainId?: ChainId;
  /** When true, skip approval gate (e.g. user already approved in chat). */
  approved?: boolean;
  /** Chat @-pinned app — forces in-app approval for swaps driven from chat. */
  pinnedAppScope?: PinnedAppScope | null;
};

/** Normalized outcome for UI, chat tools, and external callers. Mirrors chat ExecuteToolOutcome + errors. */
export type AppActionResult =
  | {
      status: "executed";
      action: AppActionName;
      agent_transaction_id?: string;
      digest: string;
      explorer_url: string | null;
      result: TxResult;
    }
  | {
      status: "approval_required";
      action: AppActionName;
      agent_transaction_id: string;
      pending: PendingTransaction;
    }
  | {
      status: "preview_delegated";
      action: AppActionName;
      message: string;
    }
  | {
      status: "error";
      action: AppActionName;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };
