import type { BalanceResult } from "../../chains/types.js";
import type { UpdateMemoryResult } from "../../memory/agent-memory.types.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { UPDATE_MEMORY_TOOL_NAME } from "../update-memory.tool.js";

export function summarizeToolResult(name: string, result: unknown): string {
  if (name === UPDATE_MEMORY_TOOL_NAME) {
    const outcome = result as UpdateMemoryResult;
    return `Memory updated: ${outcome.summary}`;
  }

  if (name === QUERY_CHAIN_TOOL_NAME) {
    const balance = result as BalanceResult;
    return `Balance: ${balance.balance_display} ${balance.native_symbol}`;
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
