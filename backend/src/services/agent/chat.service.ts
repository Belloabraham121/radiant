import { AppError } from "../../errors/app-error.js";
import type { ChatRequest, ChatResponse } from "./agent.types.js";
import {
  persistApprovalTurn,
  persistToolFailureTurn,
  runChatTurnWithFallback,
} from "./chat-orchestrator.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { approvePendingTransaction } from "./transaction-approval.service.js";
import {
  buildTransactionErrorUserContext,
  transactionContextFromPending,
} from "./transaction-error-context.js";

export async function handleChatMessage(
  privyUserId: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  if (request.approve_transaction_id) {
    const outcome = await approvePendingTransaction(
      privyUserId,
      request.approve_transaction_id,
    );

    if (!outcome) {
      throw new AppError(
        404,
        "APPROVAL_NOT_FOUND",
        "Transaction approval expired or was not found.",
      );
    }

    if (outcome.ok) {
      const reply = `Approved. Transaction submitted on ${outcome.result.chain_id}. Digest: ${outcome.result.digest}`;

      return persistApprovalTurn(privyUserId, request, reply, [
        {
          name: "execute_transaction",
          result: { status: "executed", result: outcome.result },
        },
      ]);
    }

    const txContext = transactionContextFromPending(outcome.pending);

    return persistToolFailureTurn(privyUserId, request, {
      toolName: EXECUTE_TRANSACTION_TOOL_NAME,
      toolResult: {
        error: {
          code: outcome.error.code,
          message: outcome.error.message,
          ...(outcome.error.details !== undefined ? { details: outcome.error.details } : {}),
        },
      },
      transactionContext: txContext,
      userContext: buildTransactionErrorUserContext(
        txContext,
        "I clicked Approve on a pending transaction in the app.",
      ),
    });
  }

  return runChatTurnWithFallback(privyUserId, request);
}
