import type { DeepBookSwapQuoteResult } from "../../defi/deepbook/deepbook-swap.service.js";
import type { ToolCallRecord } from "../agent.types.js";
import { messageHasExecutableSwapIntent } from "../workflow/workflow-parser.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";

function isSwapQuoteResult(result: unknown): result is DeepBookSwapQuoteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "input_amount_display" in result &&
    "output_amount_display" in result &&
    !("error" in result)
  );
}

export function findLatestSwapQuote(toolCalls: ToolCallRecord[]): DeepBookSwapQuoteResult | null {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const call = toolCalls[i];
    if (call.name === QUERY_CHAIN_TOOL_NAME && isSwapQuoteResult(call.result)) {
      return call.result;
    }
  }
  return null;
}

export function hasExecuteTransactionAttempt(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => call.name === EXECUTE_TRANSACTION_TOOL_NAME);
}

/** After a quote, the agent must call execute_transaction so the approval modal can appear. */
export function shouldNudgeSwapExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  if (!messageHasExecutableSwapIntent(lastUserMessage)) {
    return false;
  }
  if (hasExecuteTransactionAttempt(toolCalls)) {
    return false;
  }
  return findLatestSwapQuote(toolCalls) !== null;
}

/** User asked for an on-chain swap but the model replied in chat without fetching a quote or executing. */
export function shouldNudgeSwapQuoteAndExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  if (!messageHasExecutableSwapIntent(lastUserMessage)) {
    return false;
  }
  if (hasExecuteTransactionAttempt(toolCalls)) {
    return false;
  }
  return findLatestSwapQuote(toolCalls) === null;
}

export const SWAP_EXECUTE_NUDGE =
  "Submit the swap now with execute_transaction using the quote you fetched (include estimated_out_display). " +
  "The app will show an approval dialog when required — do not ask me to confirm in chat.";

export const SWAP_QUOTE_AND_EXECUTE_NUDGE =
  "The user requested an on-chain swap with a specific amount and coins. In this turn call query_chain swap_quote, " +
  "then execute_transaction action swap with estimated_out_display from the quote. The app shows an approval dialog — " +
  "never ask me to confirm in chat.";
