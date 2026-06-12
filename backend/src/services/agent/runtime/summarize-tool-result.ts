import type { BalanceResult } from "../../chains/types.js";
import type { UpdateMemoryResult } from "../../memory/agent-memory.types.js";
import type { DeepBookSwapQuoteResult } from "../../defi/deepbook-swap.service.js";
import { toolErrorToModelContent } from "../../../utils/agent-tool-errors.js";
import type { AgentToolErrorResult } from "../tools.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { UPDATE_MEMORY_TOOL_NAME } from "../update-memory.tool.js";

function isToolError(result: unknown): result is AgentToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as AgentToolErrorResult).error?.message === "string"
  );
}

export function summarizeToolResult(name: string, result: unknown): string {
  if (isToolError(result)) {
    return toolErrorToModelContent(result.error);
  }

  if (name === UPDATE_MEMORY_TOOL_NAME) {
    const outcome = result as UpdateMemoryResult;
    return `Memory updated: ${outcome.summary}`;
  }

  if (name === QUERY_CHAIN_TOOL_NAME) {
    const swapQuote = result as DeepBookSwapQuoteResult;
    if (swapQuote.input_coin && swapQuote.output_amount_display != null) {
      return (
        `Swap quote: ${swapQuote.input_amount_display} ${swapQuote.input_coin} → ` +
        `~${swapQuote.output_amount_display} ${swapQuote.output_coin} (${swapQuote.pool_key})`
      );
    }

    const balance = result as BalanceResult;
    if (balance.balance_display != null && balance.native_symbol) {
      return `Balance: ${balance.balance_display} ${balance.native_symbol}`;
    }

    return "Query completed.";
  }

  if (name !== EXECUTE_TRANSACTION_TOOL_NAME) {
    return "Done.";
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    return `Approval required: ${outcome.pending.summary}`;
  }

  return `Tx digest: ${outcome.result.digest}`;
}
