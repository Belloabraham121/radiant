import type { ToolCallRecord, ExecuteToolOutcome } from "../agent/agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../agent/execute-transaction.tool.js";
import { attachMessageId } from "./agent-transaction.service.js";

function isExecuteOutcome(result: unknown): result is ExecuteToolOutcome {
  return (
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    ((result as ExecuteToolOutcome).status === "executed" ||
      (result as ExecuteToolOutcome).status === "approval_required")
  );
}

/** Collect ledger row ids from execute_transaction tool results in a turn. */
export function collectAgentTransactionIdsFromToolCalls(toolCalls: ToolCallRecord[]): string[] {
  const ids = new Set<string>();

  for (const call of toolCalls) {
    if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME || !isExecuteOutcome(call.result)) {
      continue;
    }

    if (call.result.agent_transaction_id) {
      ids.add(call.result.agent_transaction_id);
      continue;
    }

    if (call.result.status === "approval_required") {
      ids.add(call.result.pending.id);
    }
  }

  return [...ids];
}

export async function linkToolCallTransactionsToMessage(
  toolCalls: ToolCallRecord[],
  messageId: string,
): Promise<void> {
  const ids = collectAgentTransactionIdsFromToolCalls(toolCalls);
  await Promise.all(
    ids.map((transactionId) =>
      attachMessageId({ transactionId, messageId }).catch(() => undefined),
    ),
  );
}
