import type { BalanceResult } from "../../chains/types.js";
import type { ExecuteToolOutcome } from "../agent.types.js";

export function summarizeToolResult(name: string, result: unknown): string {
  if (name === "query_chain") {
    const balance = result as BalanceResult;
    return `Balance: ${balance.balance_display} ${balance.native_symbol}`;
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    return `Approval required: ${outcome.pending.summary}`;
  }

  return `Tx digest: ${outcome.result.digest}`;
}
