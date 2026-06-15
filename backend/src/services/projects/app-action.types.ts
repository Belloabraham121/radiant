import type { AgentTransactionCategory } from "../agent-transaction/agent-transaction.types.js";
import type { ChainId, TxResult } from "../chains/types.js";
import type { PendingTransaction } from "../agent/agent.types.js";
import type { PinnedAppScope } from "./pinned-app-scope.types.js";

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
