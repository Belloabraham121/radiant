import type { Prisma } from "@prisma/client";
import { getAgentProvider, getOpenAiConfig } from "../../config/agent.js";
import { getAgentPermissions } from "./agent-permissions.service.js";
import { deriveSessionTitle, resolveOrCreateSession } from "../conversation/conversation.service.js";
import { appendMessage, listRecentMessagesBySessionId } from "../conversation/message.repository.js";
import { touchSession } from "../conversation/session.repository.js";
import { formatMemoryBlock, loadAgentMemory } from "../memory/agent-memory.service.js";
import type { ChatRequest, ChatResponse } from "./agent.types.js";
import { buildAgentContextMessages } from "./context-window.js";
import { runWithExecutionProgress } from "./execution-progress-context.js";
import type { ChatStreamSender } from "./execution-progress.types.js";
import { getAgentRuntime } from "./runtime/index.js";
import type { AgentRuntime } from "./runtime/types.js";
import type { TransactionErrorContext } from "./deepbook/transaction-error-context.js";
import { synthesizeErrorExplanationReply } from "./runtime/error-explanation.js";
import { stubRuntime } from "./runtime/stub.runtime.js";
import type { AgentToolErrorResult } from "./tools.js";
import {
  isClarificationContinuationRequest,
  tryStartWorkflowFromMessage,
} from "./workflow/workflow-coordinator.js";
import {
  isApprovalContinuationMessage,
  persistWorkflowChatResponse,
} from "./workflow/workflow-runner.js";
import { tryExecuteSingleSwapFromMessage } from "./deepbook/single-swap-flow.js";
import { linkToolCallTransactionsToMessage } from "../agent-transaction/link-transactions.js";
import { recordInfeasibleFlashLoanQuotesFromToolCalls } from "../agent-transaction/record-flash-loan-quote.js";
import { extractArtifactFromToolCalls } from "../projects/extract-artifact.js";

type RunChatTurnOptions = {
  forceRuntime?: AgentRuntime;
  onStream?: ChatStreamSender;
};

export async function runChatTurn(
  privyUserId: string,
  request: ChatRequest,
  options: RunChatTurnOptions = {},
): Promise<ChatResponse> {
  const { session } = await resolveOrCreateSession(
    privyUserId,
    request.session_id,
  );

  const [priorMessages, memory, agentPermissions] = await Promise.all([
    listRecentMessagesBySessionId(session.id),
    loadAgentMemory(privyUserId),
    getAgentPermissions(privyUserId),
  ]);

  const isFirstUserMessage = priorMessages.length === 0;
  const memoryBlock = formatMemoryBlock(memory);

  await appendMessage(session.id, "user", request.message);

  if (options.onStream) {
    options.onStream("step", {
      step: {
        id: "agent",
        status: "running",
        label: "Radiant",
        detail: "Planning next steps…",
      },
    });
  }

  if (!isApprovalContinuationMessage(request.message) && !isClarificationContinuationRequest(request)) {
    const workflowOutcome = await tryStartWorkflowFromMessage(
      privyUserId,
      session.id,
      request.message,
      { memoryBlock, agentPermissions },
    );

    if (workflowOutcome) {
      const sessionTitle =
        isFirstUserMessage && session.title === "New chat"
          ? deriveSessionTitle(request.message)
          : session.title;

      await touchSession(session.id, {
        title: sessionTitle,
        updated_at: new Date(),
      });

      return persistWorkflowChatResponse(privyUserId, request, workflowOutcome);
    }

    const singleSwapOutcome = await tryExecuteSingleSwapFromMessage(
      privyUserId,
      request.message,
      session.id,
    );

    if (singleSwapOutcome) {
      const sessionTitle =
        isFirstUserMessage && session.title === "New chat"
          ? deriveSessionTitle(request.message)
          : session.title;

      await touchSession(session.id, {
        title: sessionTitle,
        updated_at: new Date(),
      });

      return persistWorkflowChatResponse(privyUserId, request, {
        ...singleSwapOutcome,
        pending_clarification: null,
        workflowCompleted: true,
      });
    }
  }

  const contextMessages = buildAgentContextMessages([
    ...priorMessages,
    { role: "user", content: request.message },
  ]);

  const runtime = options.forceRuntime ?? getAgentRuntime();
  const result = await runWithExecutionProgress(
    (event) => {
      options.onStream?.("step", event);
    },
    () =>
      runtime.runTurn({
        privyUserId,
        sessionId: session.id,
        messages: contextMessages,
        memoryBlock,
        agentPermissions,
      }),
  );

  const toolCallsForMessage = await recordInfeasibleFlashLoanQuotesFromToolCalls(
    privyUserId,
    session.id,
    result.tool_calls,
  );

  const toolCallsJson: Prisma.InputJsonValue | undefined =
    toolCallsForMessage.length > 0
      ? (toolCallsForMessage as Prisma.InputJsonValue)
      : undefined;

  const assistantMessage = await appendMessage(
    session.id,
    "assistant",
    result.reply,
    toolCallsJson,
  );

  await linkToolCallTransactionsToMessage(toolCallsForMessage, assistantMessage.id);

  const sessionTitle =
    isFirstUserMessage && session.title === "New chat"
      ? deriveSessionTitle(request.message)
      : session.title;

  await touchSession(session.id, {
    title: sessionTitle,
    updated_at: new Date(),
  });

  return {
    reply: result.reply,
    session_id: session.id,
    mode: options.forceRuntime?.id ?? runtime.id,
    tool_calls: toolCallsForMessage,
    pending_transaction: result.pending_transaction,
    pending_clarification: null,
    message_id: assistantMessage.id,
    artifact: extractArtifactFromToolCalls(toolCallsForMessage),
  };
}

/** Persist a failed tool outcome and let the agent explain it in plain language. */
export async function persistToolFailureTurn(
  privyUserId: string,
  request: ChatRequest,
  input: {
    toolName: string;
    toolResult: AgentToolErrorResult;
    userContext: string;
    transactionContext?: TransactionErrorContext;
  },
): Promise<ChatResponse> {
  const { session } = await resolveOrCreateSession(privyUserId, request.session_id);

  const [priorMessages, memory, agentPermissions] = await Promise.all([
    listRecentMessagesBySessionId(session.id),
    loadAgentMemory(privyUserId),
    getAgentPermissions(privyUserId),
  ]);

  await appendMessage(session.id, "user", request.message);

  const contextMessages = buildAgentContextMessages([
    ...priorMessages,
    { role: "user", content: request.message },
  ]);
  const memoryBlock = formatMemoryBlock(memory);

  const reply = await synthesizeErrorExplanationReply({
    toolName: input.toolName,
    toolResult: input.toolResult,
    messages: contextMessages,
    memoryBlock,
    agentPermissions,
    userContext: input.userContext,
    transactionContext: input.transactionContext,
  });

  const toolCalls = [{ name: input.toolName, result: input.toolResult }];
  const assistantMessage = await appendMessage(
    session.id,
    "assistant",
    reply,
    toolCalls as Prisma.InputJsonValue,
  );

  await linkToolCallTransactionsToMessage(toolCalls, assistantMessage.id);

  await touchSession(session.id, { updated_at: new Date() });

  return {
    reply,
    session_id: session.id,
    mode: getAgentProvider(),
    tool_calls: toolCalls,
    pending_transaction: null,
    pending_clarification: null,
    message_id: assistantMessage.id,
    artifact: extractArtifactFromToolCalls(toolCalls),
  };
}

/** Persist an approval outcome into the session transcript when possible. */
export async function persistApprovalTurn(
  privyUserId: string,
  request: ChatRequest,
  reply: string,
  toolCalls: ChatResponse["tool_calls"],
): Promise<ChatResponse> {
  const { session } = await resolveOrCreateSession(privyUserId, request.session_id);

  await appendMessage(session.id, "user", request.message);

  const assistantMessage = await appendMessage(
    session.id,
    "assistant",
    reply,
    toolCalls.length > 0 ? (toolCalls as Prisma.InputJsonValue) : undefined,
  );

  await linkToolCallTransactionsToMessage(toolCalls, assistantMessage.id);

  await touchSession(session.id, { updated_at: new Date() });

  return {
    reply,
    session_id: session.id,
    mode: getAgentProvider(),
    tool_calls: toolCalls,
    pending_transaction: null,
    pending_clarification: null,
    message_id: assistantMessage.id,
    artifact: extractArtifactFromToolCalls(toolCalls),
  };
}

export async function runChatTurnWithFallback(
  privyUserId: string,
  request: ChatRequest,
  options: Pick<RunChatTurnOptions, "onStream"> = {},
): Promise<ChatResponse> {
  try {
    return await runChatTurn(privyUserId, request, options);
  } catch (err) {
    if (getAgentProvider() === "openai" && getOpenAiConfig().fallbackStub) {
      console.warn("OpenAI agent failed; falling back to stub runtime.", err);
      return runChatTurn(privyUserId, request, { forceRuntime: stubRuntime, ...options });
    }
    throw err;
  }
}
