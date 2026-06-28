import type { FlashLoanTurnIntent } from "./deepbook/flash-loan-turn-intent.js";

export type ExecuteTransactionContext = {
  sessionId?: string;
  messageId?: string;
  workflowStepIndex?: number;
};

export type AgentToolOptions = ExecuteTransactionContext & {
  approved?: boolean;
  /** When true with sessionId + SSE subscriber, emit live preview animation events. */
  broadcast?: boolean;
  /** Resolved from the latest user message — gates flash-loan execute vs quote-only UI. */
  flashLoanTurnIntent?: FlashLoanTurnIntent | null;
};

export function resolveExecuteTransactionOptions(
  options: AgentToolOptions | boolean = {},
): AgentToolOptions {
  if (typeof options === "boolean") {
    return { approved: options };
  }
  return options;
}
