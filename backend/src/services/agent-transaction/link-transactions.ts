import type { ToolCallRecord, ExecuteToolOutcome } from "../agent/agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../agent/execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../agent/query-chain.tool.js";
import { isFlashLoanQuoteResult } from "../agent/deepbook/flash-loan-approval-flow.js";
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

function readAgentTransactionIdFromQuoteResult(result: unknown): string | null {
  if (!isFlashLoanQuoteResult(result)) {
    return null;
  }
  const id = (result as { agent_transaction_id?: string }).agent_transaction_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Collect ledger row ids from execute_transaction tool results in a turn. */
export function collectAgentTransactionIdsFromToolCalls(toolCalls: ToolCallRecord[]): string[] {
  const ids = new Set<string>();

  for (const call of toolCalls) {
    if (call.name === QUERY_CHAIN_TOOL_NAME) {
      const quoteId = readAgentTransactionIdFromQuoteResult(call.result);
      if (quoteId) {
        ids.add(quoteId);
      }
    }

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
