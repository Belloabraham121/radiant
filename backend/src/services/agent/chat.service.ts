import { AppError } from "../../errors/app-error.js";
import type { ChatRequest, ChatResponse } from "./agent.types.js";
import { persistApprovalTurn, runChatTurnWithFallback } from "./chat-orchestrator.js";
import { approvePendingTransaction } from "./transaction-approval.service.js";

export async function handleChatMessage(
  privyUserId: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  if (request.approve_transaction_id) {
    const approved = await approvePendingTransaction(
      privyUserId,
      request.approve_transaction_id,
    );

    if (!approved) {
      throw new AppError(
        404,
        "APPROVAL_NOT_FOUND",
        "Transaction approval expired or was not found.",
      );
    }

    const reply = `Approved. Transaction submitted on ${approved.result.chain_id}. Digest: ${approved.result.digest}`;

    return persistApprovalTurn(privyUserId, request, reply, [
      {
        name: "execute_transaction",
        result: { status: "executed", result: approved.result },
      },
    ]);
  }

  return runChatTurnWithFallback(privyUserId, request);
}
