import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ChatRequest, ChatResponse } from "./agent.types.js";
import {
  persistApprovalTurn,
  persistToolFailureTurn,
  runChatTurnWithFallback,
} from "./chat-orchestrator.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { approvePendingTransaction } from "./transaction-approval.service.js";

export async function handleChatMessage(
  privyUserId: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  if (request.approve_transaction_id) {
    try {
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
    } catch (err) {
      const mapped = mapAgentToolError(err);

      return persistToolFailureTurn(privyUserId, request, {
        toolName: EXECUTE_TRANSACTION_TOOL_NAME,
        toolResult: {
          error: {
            code: mapped.code,
            message: mapped.message,
            ...(mapped.details !== undefined ? { details: mapped.details } : {}),
          },
        },
        userContext: "I clicked Approve on a pending transaction in the app.",
      });
    }
  }

  return runChatTurnWithFallback(privyUserId, request);
}
