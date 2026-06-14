import type { DeepBookPoolInfo, DeepBookTickerMap } from "../../defi/deepbook/deepbook-pools.service.js";
import type { ToolCallRecord } from "../agent.types.js";
import type { AgentToolErrorResult } from "../tools.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import {
  findLatestSwapQuote,
  hasExecuteTransactionAttempt,
} from "./swap-approval-flow.js";
import { messageHasExecutableSwapIntent } from "../workflow/workflow-parser.js";

export function userAskedMarketPrice(message: string): boolean {
  return (
    /\b(price|priced?|ticker|rate|how much|market|trading at)\b/i.test(message) ||
    /\b\w+\s*\/\s*\w+\b/.test(message)
  );
}

export function isCompoundMarketAndSwapRequest(message: string): boolean {
  return userAskedMarketPrice(message) && messageHasExecutableSwapIntent(message);
}

function isPoolInfoResult(result: unknown): result is DeepBookPoolInfo {
  return (
    typeof result === "object" &&
    result !== null &&
    !("error" in result) &&
    "pool_key" in result &&
    "base_coin" in result &&
    "quote_coin" in result &&
    !("input_amount_display" in result)
  );
}

function isTickerMapResult(result: unknown): result is DeepBookTickerMap {
  return (
    typeof result === "object" &&
    result !== null &&
    !("error" in result) &&
    Array.isArray((result as DeepBookTickerMap).tickers)
  );
}

export function hasPoolMarketQuery(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => {
    if (call.name !== QUERY_CHAIN_TOOL_NAME) {
      return false;
    }
    return isPoolInfoResult(call.result) || isTickerMapResult(call.result);
  });
}

export function hasExecuteTransactionError(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some(
    (call) =>
      call.name === EXECUTE_TRANSACTION_TOOL_NAME &&
      typeof call.result === "object" &&
      call.result !== null &&
      "error" in call.result,
  );
}

/** Price question + swap: fetch market data before attempting the swap. */
export function shouldNudgePoolInfoBeforeSwap(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  if (!isCompoundMarketAndSwapRequest(lastUserMessage)) {
    return false;
  }
  if (hasPoolMarketQuery(toolCalls)) {
    return false;
  }
  if (hasExecuteTransactionAttempt(toolCalls)) {
    return false;
  }
  return true;
}

export const POOL_INFO_BEFORE_SWAP_NUDGE =
  "The user asked for a market price AND a swap in one message. " +
  "First call query_chain deepbook_pool_info for the relevant pool (e.g. SUI_USDC) so you can answer the price part. " +
  "Then call swap_quote and execute_transaction as needed.";

export function shouldFinalizeCompoundReply(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
  executeToolError: AgentToolErrorResult | null,
): boolean {
  if (!isCompoundMarketAndSwapRequest(lastUserMessage)) {
    return false;
  }
  if (!executeToolError) {
    return false;
  }
  return hasPoolMarketQuery(toolCalls) || findLatestSwapQuote(toolCalls) !== null;
}
