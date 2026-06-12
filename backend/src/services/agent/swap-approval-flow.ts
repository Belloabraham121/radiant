import type { DeepBookSwapQuoteResult } from "../defi/deepbook-swap.service.js";
import type { ToolCallRecord } from "./agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "./query-chain.tool.js";

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

export function userRequestedSwap(message: string): boolean {
  return /\b(swap|convert|trade|exchange)\b/i.test(message);
}

/** After a quote, the agent must call execute_transaction so the approval modal can appear. */
export function shouldNudgeSwapExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  if (!userRequestedSwap(lastUserMessage)) {
    return false;
  }
  if (hasExecuteTransactionAttempt(toolCalls)) {
    return false;
  }
  return findLatestSwapQuote(toolCalls) !== null;
}

export const SWAP_EXECUTE_NUDGE =
  "Submit the swap now with execute_transaction using the quote you fetched (include estimated_out_display). " +
  "The app will show an approval dialog when required — do not ask me to confirm in chat.";
