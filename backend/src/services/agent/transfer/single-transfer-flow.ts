import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import { formatRadiantChainLabel } from "../../agent-transaction/approval-preview/chain-labels.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";
import { isExecutePendingUserAction, pendingTransactionFromExecuteOutcome } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { runExecuteTransactionToolWithApproval } from "../tools.js";
import { looksLikeWorkflowMessage } from "../workflow/heuristic-planner.js";
import { parseSingleTransferIntent } from "./transfer-intent-parser.js";

export type SingleTransferOutcome = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

const APPROVAL_REPLY =
  "This transfer needs your approval before I can broadcast it. Review the details and confirm in the dialog.";

/**
 * Deterministic fast path for "send <amount> <token> to <address>" — runs
 * before the swap/bridge intent classifiers so recipient transfers never get
 * misread as bridges. Declines (returns null) on any ambiguity.
 */
export async function tryExecuteTransferFromMessage(
  privyUserId: string,
  message: string,
  sessionId?: string,
): Promise<SingleTransferOutcome | null> {
  if (looksLikeWorkflowMessage(message)) {
    return null;
  }

  const intent = parseSingleTransferIntent(message);
  if (!intent) {
    return null;
  }

  const chainLabel = formatRadiantChainLabel(intent.input.chain_id, intent.evmChainId);
  const tool_calls: ToolCallRecord[] = [];

  let outcome: ExecuteToolOutcome;
  try {
    outcome = await runExecuteTransactionToolWithApproval(privyUserId, intent.input, {
      sessionId,
    });
  } catch (err) {
    const mapped = mapAgentToolError(err);
    tool_calls.push({
      name: EXECUTE_TRANSACTION_TOOL_NAME,
      result: {
        error: {
          code: mapped instanceof AppError ? mapped.code : "TRANSFER_FAILED",
          message: mapped instanceof AppError ? mapped.message : String(mapped),
        },
      },
    });
    return {
      reply:
        mapped instanceof AppError ? mapped.message : "Transfer could not be submitted.",
      tool_calls,
      pending_transaction: null,
    };
  }

  tool_calls.push({
    name: EXECUTE_TRANSACTION_TOOL_NAME,
    result: outcome,
  });

  if (isExecutePendingUserAction(outcome)) {
    return {
      reply: APPROVAL_REPLY,
      tool_calls,
      pending_transaction: pendingTransactionFromExecuteOutcome(outcome) ?? null,
    };
  }

  const digest =
    outcome.status === "executed" && outcome.result?.digest
      ? ` Digest: ${outcome.result.digest}.`
      : "";

  return {
    reply:
      `Transfer submitted: ${intent.amount} ${intent.symbol} to ` +
      `${intent.recipient.slice(0, 10)}… on ${chainLabel}.${digest}`,
    tool_calls,
    pending_transaction: null,
  };
}
