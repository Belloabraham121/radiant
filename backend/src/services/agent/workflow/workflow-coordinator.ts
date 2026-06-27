import { getAgentProvider } from "../../../config/agent.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import type { ChatRequest, ChatResponse } from "../agent.types.js";
import {
  clearSessionClarification,
  getClarificationById,
  startSessionClarification,
} from "./clarification.store.js";
import type { ClarificationAnswer, ClarificationGap, PendingClarification } from "./clarification.types.js";
import { planWorkflowMessage } from "./workflow-planner.js";
import { skipStepsInPlan, validatePlannerOutput } from "./workflow-plan-validator.js";
import {
  applyClarificationAnswer,
  applyClarificationAnswerWithSnapping,
  buildPlanPreview,
  collectClarificationGaps,
  gapToPending,
} from "./workflow-clarification-gaps.js";
import { enrichClarificationGaps } from "./limit-order-clarification.js";
import { synthesizeWorkflowClarificationGap } from "../clarification/intent-clarification-runner.js";
import {
  normalizeWorkflowPlan,
  validateWorkflowPlan,
} from "./workflow-param-normalizer.js";
import {
  persistWorkflowChatResponse,
  startAndRunWorkflow,
  continueWorkflowAfterMidRunClarification,
} from "./workflow-runner.js";
import { continueSwapClarification } from "../swap/swap-clarification.flow.js";
import { continueBridgeClarification } from "../bridge/bridge-clarification.flow.js";
import { continueSquidTestClarification } from "../squid-test/squid-clarification.flow.js";
import { getSessionWorkflow, updateSessionWorkflow } from "./session-workflow.store.js";
import type { WorkflowPlan, WorkflowRunOutcome } from "./workflow.types.js";

export function parseClarificationAnswer(request: ChatRequest): ClarificationAnswer | null {
  const confirm = request.clarification_confirm ?? request.clarification_response;
  if (confirm) {
    return { confirm };
  }
  if (request.clarification_value !== undefined) {
    return { value: request.clarification_value };
  }
  if (request.clarification_option_id) {
    return { selected_option_id: request.clarification_option_id };
  }
  if (request.clarification_option_ids?.length) {
    return { selected_option_ids: request.clarification_option_ids };
  }
  return null;
}

export function isClarificationContinuationRequest(request: ChatRequest): boolean {
  if (!request.clarification_id) {
    return false;
  }
  return parseClarificationAnswer(request) !== null;
}

function buildClarificationOutcome(
  question: string,
  clarification: PendingClarification,
): WorkflowRunOutcome {
  return {
    reply: question,
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: clarification,
    workflowCompleted: false,
  };
}

async function startWorkflowClarification(
  sessionId: string,
  plan: WorkflowPlan,
  gap: ClarificationGap,
  options?: { includePlanPreview?: boolean },
): Promise<WorkflowRunOutcome> {
  const enrichedGap = await synthesizeWorkflowClarificationGap(plan, gap);
  const clarificationState = startSessionClarification({
    sessionId,
    gap: enrichedGap,
    plan,
  });
  const pending = gapToPending(enrichedGap, clarificationState.id);
  if (options?.includePlanPreview !== false) {
    pending.plan_preview = buildPlanPreview(plan);
  }
  return buildClarificationOutcome(enrichedGap.question, pending);
}

function workflowAbortedReply(): WorkflowRunOutcome {
  return {
    reply: "Understood — I won't run those steps.",
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: null,
    workflowCompleted: true,
  };
}

function notEnoughStepsReply(): WorkflowRunOutcome {
  return {
    reply: "Understood — not enough steps remain to continue the workflow.",
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: null,
    workflowCompleted: true,
  };
}

async function continueWithResolvedPlan(
  privyUserId: string,
  sessionId: string,
  plan: WorkflowPlan,
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
  },
): Promise<WorkflowRunOutcome> {
  const normalized = normalizeWorkflowPlan(plan);
  const gaps = await enrichClarificationGaps(normalized, collectClarificationGaps(normalized));
  if (gaps.length > 0) {
    return startWorkflowClarification(sessionId, normalized, gaps[0]);
  }

  const paramCheck = validateWorkflowPlan(normalized);
  if (!paramCheck.ok) {
    const gapsAfterValidation = await enrichClarificationGaps(
      normalized,
      collectClarificationGaps(normalized),
    );
    if (gapsAfterValidation.length > 0) {
      return startWorkflowClarification(sessionId, normalized, gapsAfterValidation[0], {
        includePlanPreview: false,
      });
    }
    return {
      reply: paramCheck.message,
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  if (normalized.steps.length < 2) {
    return {
      reply: "Confirmed, but not enough steps remain to run a workflow.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  return startAndRunWorkflow(privyUserId, sessionId, normalized, options);
}

export async function tryStartWorkflowFromMessage(
  privyUserId: string,
  sessionId: string,
  message: string,
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
  },
): Promise<WorkflowRunOutcome | null> {
  const plannerOutput = await planWorkflowMessage(message);
  if (!plannerOutput) {
    return null;
  }

  const validation = await validatePlannerOutput(plannerOutput, message);

  if (validation.status === "not_workflow") {
    return null;
  }

  if (validation.status === "clarify") {
    return startWorkflowClarification(sessionId, validation.plan, validation.gap);
  }

  return startAndRunWorkflow(
    privyUserId,
    sessionId,
    normalizeWorkflowPlan(validation.plan),
    options,
  );
}

export async function continueWorkflowAfterClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  answer: ClarificationAnswer,
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
  },
): Promise<WorkflowRunOutcome | null> {
  const state = getClarificationById(clarificationId);
  if (!state || state.sessionId !== sessionId) {
    return null;
  }

  if (state.context === "swap_intent") {
    return continueSwapClarification(privyUserId, sessionId, clarificationId, answer);
  }

  if (state.context === "bridge_intent") {
    return continueBridgeClarification(privyUserId, sessionId, clarificationId, answer);
  }

  if (state.context === "squid_test_intent") {
    return continueSquidTestClarification(privyUserId, sessionId, clarificationId, answer);
  }

  const workflowState = getSessionWorkflow(sessionId);
  const isMidRunClarification =
    workflowState?.status === "paused_clarification" &&
    workflowState.pendingClarificationId === clarificationId;

  if (isMidRunClarification) {
    clearSessionClarification(sessionId);
    const midRun = await continueWorkflowAfterMidRunClarification(
      privyUserId,
      sessionId,
      clarificationId,
      state.gap,
      answer,
      options,
    );
    if (midRun) {
      return midRun;
    }

    const clarificationState = startSessionClarification({
      sessionId,
      gap: state.gap,
      plan: workflowState.plan,
    });
    updateSessionWorkflow(sessionId, {
      status: "paused_clarification",
      pendingClarificationId: clarificationState.id,
    });
    const pending = gapToPending(state.gap, clarificationState.id);
    return buildClarificationOutcome(
      `I didn't understand that answer. ${state.gap.question}`,
      pending,
    );
  }

  clearSessionClarification(sessionId);

  const applied = await applyClarificationAnswerWithSnapping(state.plan, state.gap, answer);
  if (applied === null) {
    const clarificationState = startSessionClarification({
      sessionId,
      gap: state.gap,
      plan: state.plan,
    });
    const pending = gapToPending(state.gap, clarificationState.id);
    return buildClarificationOutcome(
      `I didn't understand that answer. ${state.gap.question}`,
      pending,
    );
  }

  if ("skip_step_indices" in applied) {
    if (applied.skip_step_indices.length === 0) {
      return workflowAbortedReply();
    }

    const trimmed = skipStepsInPlan(state.plan, applied.skip_step_indices);
    if (trimmed.steps.length === 0) {
      return workflowAbortedReply();
    }
    if (trimmed.steps.length < 2) {
      return notEnoughStepsReply();
    }

    return continueWithResolvedPlan(privyUserId, sessionId, trimmed, options);
  }

  return continueWithResolvedPlan(privyUserId, sessionId, applied, options);
}

export async function persistClarificationChatResponse(
  privyUserId: string,
  request: ChatRequest,
  outcome: WorkflowRunOutcome,
): Promise<ChatResponse> {
  return persistWorkflowChatResponse(privyUserId, request, outcome);
}

export function getWorkflowChatMode(): ChatResponse["mode"] {
  return getAgentProvider();
}
