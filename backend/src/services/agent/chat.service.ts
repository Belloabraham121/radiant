import { AppError } from "../../errors/app-error.js";
import type { ChatRequest, ChatResponse } from "./agent.types.js";
import {
  persistApprovalTurn,
  persistToolFailureTurn,
  runChatTurnWithFallback,
} from "./chat-orchestrator.js";
import type { ChatStreamSender } from "./execution-progress.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { approvePendingTransaction, rejectPendingTransaction } from "./transaction-approval.service.js";
import { buildExplorerTxUrl } from "../agent-transaction/explorer-url.js";
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
import { formatMarginManagerApprovalNote } from "./runtime/summarize-tool-result.js";
import {
  buildCrossChainRoutesToolResult,
  formatLifiEtaLabel,
  readLifiTrackingFromTxResult,
} from "../defi/lifi/lifi-tracking.js";

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

      const explorerUrl = buildExplorerTxUrl(outcome.result.chain_id, outcome.result.digest);
      const marginNote = formatMarginManagerApprovalNote(outcome.result);
      const lifiTracking = readLifiTrackingFromTxResult(outcome.result);
      const isLifiPending =
        lifiTracking != null &&
        (outcome.result.effects_status === "pending" ||
          outcome.result.effects_status === "unknown");

      let reply: string;
      if (isLifiPending && lifiTracking) {
        const eta = formatLifiEtaLabel(lifiTracking.estimated_duration_seconds);
        const sourceTx = outcome.result.digest || lifiTracking.tx_hashes[0];
        reply = sourceTx
          ? `Approved. Source transaction submitted (${sourceTx.slice(0, 10)}…). ${eta} — I'll update this thread as the bridge completes.`
          : `Approved. Bridge submitted. ${eta} — I'll update this thread as the bridge completes.`;
      } else {
        reply = explorerUrl
          ? `Approved. Transaction submitted on ${outcome.result.chain_id}. [View on Sui Explorer](${explorerUrl}) — Digest: ${outcome.result.digest}.${marginNote}`
          : `Approved. Transaction submitted on ${outcome.result.chain_id}. Digest: ${outcome.result.digest}.${marginNote}`;
      }

      const toolCalls: ChatResponse["tool_calls"] = [];
      if (isLifiPending && outcome.pending.params) {
        toolCalls.push({
          name: "query_chain",
          query: "cross_chain_routes",
          result: buildCrossChainRoutesToolResult(outcome.pending.params),
        });
      }
      toolCalls.push({
        name: EXECUTE_TRANSACTION_TOOL_NAME,
        action: outcome.pending.action,
        result: {
          status: "executed",
          agent_transaction_id: request.approve_transaction_id,
          result: outcome.result,
        },
      });

      return persistApprovalTurn(privyUserId, request, reply, toolCalls);
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

export async function handleChatMessageStream(
  privyUserId: string,
  request: ChatRequest,
  send: ChatStreamSender,
): Promise<ChatResponse> {
  if (
    request.approve_transaction_id ||
    request.reject_transaction_id ||
    request.clarification_id
  ) {
    const data = await handleChatMessage(privyUserId, request);
    send("done", data);
    return data;
  }

  try {
    const data = await runChatTurnWithFallback(privyUserId, request, {
      onStream: send,
    });
    send("done", data);
    return data;
  } catch (err) {
    const message = err instanceof AppError ? err.message : "Agent request failed.";
    send("error", { message });
    throw err;
  }
}
