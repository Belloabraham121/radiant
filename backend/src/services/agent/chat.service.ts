import { AppError } from "../../errors/app-error.js";
import type { ChatRequest, ChatResponse } from "./agent.types.js";
import {
  persistApprovalTurn,
  persistToolFailureTurn,
  runChatTurnWithFallback,
} from "./chat-orchestrator.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { approvePendingTransaction, rejectPendingTransaction } from "./transaction-approval.service.js";
import {
  buildTransactionErrorUserContext,
  transactionContextFromPending,
} from "./deepbook/transaction-error-context.js";
import { getAgentPermissions } from "./agent-permissions.service.js";
import { formatMemoryBlock, loadAgentMemory } from "../memory/agent-memory.service.js";
import {
  continueWorkflowAfterClarification,
  isClarificationContinuationRequest,
  parseClarificationAnswer,
} from "./workflow/workflow-coordinator.js";
import {
  continueWorkflowAfterApproval,
  persistWorkflowChatResponse,
} from "./workflow/workflow-runner.js";

export async function handleChatMessage(
  privyUserId: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  if (isClarificationContinuationRequest(request)) {
    const memoryBlock = formatMemoryBlock(await loadAgentMemory(privyUserId));
    const agentPermissions = await getAgentPermissions(privyUserId);

    if (!request.session_id) {
      throw new AppError(400, "SESSION_REQUIRED", "session_id is required for clarification.");
    }

    const answer = parseClarificationAnswer(request);
    if (!answer) {
      throw new AppError(400, "CLARIFICATION_ANSWER_REQUIRED", "A clarification answer is required.");
    }

    const continued = await continueWorkflowAfterClarification(
      privyUserId,
      request.session_id,
      request.clarification_id!,
      answer,
      { memoryBlock, agentPermissions },
    );

    if (!continued) {
      throw new AppError(
        404,
        "CLARIFICATION_NOT_FOUND",
        "Clarification expired or was not found.",
      );
    }

    return persistWorkflowChatResponse(privyUserId, request, continued);
  }

  if (request.reject_transaction_id) {
    const rejected = await rejectPendingTransaction(
      privyUserId,
      request.reject_transaction_id,
    );

    if (!rejected) {
      throw new AppError(
        404,
        "APPROVAL_NOT_FOUND",
        "Transaction approval expired or was not found.",
      );
    }

    return persistApprovalTurn(privyUserId, request, "Transaction cancelled.", []);
  }

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
      const memoryBlock = formatMemoryBlock(await loadAgentMemory(privyUserId));
      const agentPermissions = await getAgentPermissions(privyUserId);

      if (request.session_id) {
        const continued = await continueWorkflowAfterApproval(
          privyUserId,
          request.session_id,
          outcome.result,
          request.approve_transaction_id,
          { memoryBlock, agentPermissions },
        );

        if (continued) {
          return persistWorkflowChatResponse(privyUserId, request, continued);
        }
      }

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
