import type { ToolCallRecord } from "./agent.types.js";
import {
  findLatestFlashLoanQuote,
  hasFlashLoanExecutionAttempt,
} from "./deepbook/flash-loan-approval-flow.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { CALL_APP_ACTION_TOOL_NAME } from "../projects/call-app-action.tool.js";
import type { AppActionResult } from "../projects/app-action.types.js";
import { QUERY_CHAIN_TOOL_NAME } from "./query-chain.tool.js";
import type { AgentToolErrorResult } from "./tools.js";

export const REPLY_AFTER_TOOLS_NUDGE =
  "You already called tools this turn and have results in the conversation. " +
  "Write a complete reply to the user's latest message using that data. " +
  "Read their intent from what they said: research questions (explore, compare, suggest, explain, recommend) should be answered in text — " +
  "use query_chain only, never execute_transaction unless they clearly want to transact right now. " +
  "Execution requests should use execute_transaction when ready. " +
  "Only call more tools if existing results are insufficient.";

export const FLASH_LOAN_RESEARCH_REPLY_NUDGE =
  "The user is exploring flash loans (pools, strategy, sizing) — not asking you to execute yet. " +
  "Write a full advisory reply from your tool results: which pools support flash loans, recommended strategy and why, " +
  "suggested borrow amount and any upfront capital, trade-offs, and example quotes if you fetched them. " +
  "Do not call execute_transaction. Invite them to say when they want you to run it.";

export const AGENT_TRANSACTIONS_REPLY_NUDGE =
  "The agent_transactions tool result above includes date, amount, status, and digest for each row. " +
  "Copy those exact values into your reply. Never use placeholders like [Insert Date], [Insert Amount], or [Insert Status].";

export function isSuccessfulToolResult(result: unknown): boolean {
  return typeof result === "object" && result !== null && !("error" in result);
}

export function hasSuccessfulQueryResults(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some(
    (call) => call.name === QUERY_CHAIN_TOOL_NAME && isSuccessfulToolResult(call.result),
  );
}

export function hasAgentTransactionsQuery(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => {
    if (call.name !== QUERY_CHAIN_TOOL_NAME || !isSuccessfulToolResult(call.result)) {
      return false;
    }
    const result = call.result;
    return (
      typeof result === "object" &&
      result !== null &&
      Array.isArray((result as { items?: unknown }).items) &&
      typeof (result as { summary?: unknown }).summary === "string"
    );
  });
}

function isPendingOrExecutedOutcome(result: unknown): boolean {
  if (typeof result !== "object" || result === null || "error" in result) {
    return false;
  }
  const outcome = result as { status?: string };
  return (
    outcome.status === "approval_required" ||
    outcome.status === "executed" ||
    outcome.status === "preview_delegated"
  );
}

function hasPendingOrExecutedTransaction(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => {
    if (
      call.name === EXECUTE_TRANSACTION_TOOL_NAME ||
      call.name === CALL_APP_ACTION_TOOL_NAME
    ) {
      return isPendingOrExecutedOutcome(call.result);
    }
    return false;
  });
}

/** Model fetched data but returned no assistant text — prompt a reply without guessing user intent. */
export function shouldNudgeReplyAfterTools(
  toolCalls: ToolCallRecord[],
  assistantContent?: string | null,
): boolean {
  if (assistantContent?.trim()) {
    return false;
  }
  if (!hasSuccessfulQueryResults(toolCalls)) {
    return false;
  }
  return !hasPendingOrExecutedTransaction(toolCalls);
}

export function buildReplyAfterToolsNudge(toolCalls: ToolCallRecord[]): string {
  const parts = [REPLY_AFTER_TOOLS_NUDGE];

  if (findLatestFlashLoanQuote(toolCalls) && !hasFlashLoanExecutionAttempt(toolCalls)) {
    parts.push(FLASH_LOAN_RESEARCH_REPLY_NUDGE);
  }

  if (hasAgentTransactionsQuery(toolCalls)) {
    parts.push(AGENT_TRANSACTIONS_REPLY_NUDGE);
  }

  return parts.join("\n\n");
}

export function findLastToolError(
  toolCalls: ToolCallRecord[],
): { name: string; result: AgentToolErrorResult } | null {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const call = toolCalls[i];
    if (
      typeof call.result === "object" &&
      call.result !== null &&
      "error" in call.result &&
      typeof (call.result as AgentToolErrorResult).error?.message === "string"
    ) {
      return { name: call.name, result: call.result as AgentToolErrorResult };
    }
    if (call.name === CALL_APP_ACTION_TOOL_NAME) {
      const outcome = call.result as AppActionResult;
      if (outcome?.status === "error") {
        return {
          name: call.name,
          result: { error: outcome.error },
        };
      }
    }
  }
  return null;
}

export function findLatestAppActionResult(
  toolCalls: ToolCallRecord[],
): { action?: string; result: AppActionResult } | null {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const call = toolCalls[i];
    if (call.name !== CALL_APP_ACTION_TOOL_NAME) {
      continue;
    }
    const result = call.result;
    if (typeof result === "object" && result !== null && "status" in result) {
      return { action: call.action, result: result as AppActionResult };
    }
  }
  return null;
}

export function hasSuccessfulAppActionResult(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => {
    if (call.name !== CALL_APP_ACTION_TOOL_NAME) {
      return false;
    }
    const result = call.result as AppActionResult | undefined;
    return (
      result?.status === "executed" ||
      result?.status === "approval_required" ||
      result?.status === "preview_delegated"
    );
  });
}

export function buildReplyFromAppActionToolCalls(toolCalls: ToolCallRecord[]): string | null {
  const latest = findLatestAppActionResult(toolCalls);
  if (!latest) {
    return null;
  }

  const { result } = latest;
  if (result.status === "preview_delegated") {
    return result.message;
  }
  if (result.status === "approval_required") {
    return "Confirm the transaction in your app preview.";
  }
  if (result.status === "executed") {
    const action = latest.action ?? result.action;
    return `${action} completed in your app — digest ${result.digest}.`;
  }
  if (result.status === "error") {
    return result.error.message;
  }
  return null;
}
