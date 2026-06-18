import type { FlashLoanTurnIntent } from "./deepbook/flash-loan-turn-intent.js";
import type { AppActionSource } from "../projects/app-action.types.js";
import type { PinnedAppScope } from "../projects/pinned-app-scope.types.js";

export type ExecuteTransactionContext = {
  sessionId?: string;
  messageId?: string;
  workflowStepIndex?: number;
};

export type AgentToolOptions = ExecuteTransactionContext & {
  approved?: boolean;
  /** When true with sessionId + SSE subscriber, emit live preview animation events. */
  broadcast?: boolean;
  /** Raw JSON tool arguments — used to recover partial generate_app payloads. */
  rawArguments?: string;
  /** Resolved from the latest user message — gates flash-loan execute vs quote-only UI. */
  flashLoanTurnIntent?: FlashLoanTurnIntent | null;
  /** User-selected app from chat composer — defaults call_app_action scope. */
  pinnedAppScope?: PinnedAppScope | null;
  /** ui = artifact POST /actions/* — auto-approve thresholds do not apply. */
  source?: AppActionSource;
};

export function resolveExecuteTransactionOptions(
  options: AgentToolOptions | boolean = {},
): AgentToolOptions {
  if (typeof options === "boolean") {
    return { approved: options };
  }
  return options;
}
