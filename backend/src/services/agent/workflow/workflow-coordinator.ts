import { getAgentProvider } from "../../../config/agent.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import type { ChatRequest, ChatResponse } from "../agent.types.js";
import {
  clearSessionClarification,
  getClarificationById,
  startSessionClarification,
} from "./clarification.store.js";
import type { PendingClarification } from "./clarification.types.js";
import { planWorkflowMessage } from "./workflow-planner.js";
import {
  applyBindingsToPlan,
  skipStepsInPlan,
  validatePlannerOutput,
} from "./workflow-plan-validator.js";
import {
  persistWorkflowChatResponse,
  startAndRunWorkflow,
} from "./workflow-runner.js";
import type { WorkflowRunOutcome } from "./workflow.types.js";

export function isClarificationContinuationRequest(request: ChatRequest): boolean {
  return Boolean(request.clarification_id && request.clarification_response);
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
    const clarificationState = startSessionClarification({
      sessionId,
      question: validation.question,
      step_index: validation.step_index,
      kind: validation.kind,
      plan: validation.plan,
      on_yes_bindings: validation.on_yes_bindings,
      skip_step_indices: validation.skip_step_indices,
    });

    const pending: PendingClarification = {
      id: clarificationState.id,
      question: validation.question,
      step_index: validation.step_index,
      kind: validation.kind,
      plan_preview: validation.plan.steps.map((step, i) => `${i + 1}. ${step.label}`).join("\n"),
    };

    return buildClarificationOutcome(validation.question, pending);
  }

  return startAndRunWorkflow(privyUserId, sessionId, validation.plan, options);
}

export async function continueWorkflowAfterClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  response: "yes" | "no",
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
  },
): Promise<WorkflowRunOutcome | null> {
  const state = getClarificationById(clarificationId);
  if (!state || state.sessionId !== sessionId) {
    return null;
  }

  clearSessionClarification(sessionId);

  if (response === "no") {
    const skipIndices =
      state.skip_step_indices ??
      (state.step_index !== undefined ? [state.step_index] : []);

    const trimmed = skipStepsInPlan(state.plan, skipIndices);

    if (trimmed.steps.length === 0) {
      return {
        reply: "Understood — I won't run those steps.",
        tool_calls: [],
        pending_transaction: null,
        pending_clarification: null,
        workflowCompleted: true,
      };
    }

    if (trimmed.steps.length < 2) {
      return {
        reply: "Understood — not enough steps remain to continue the workflow.",
        tool_calls: [],
        pending_transaction: null,
        pending_clarification: null,
        workflowCompleted: true,
      };
    }

    return startAndRunWorkflow(privyUserId, sessionId, trimmed, options);
  }

  let plan = state.plan;
  if (state.on_yes_bindings && state.on_yes_bindings.length > 0) {
    plan = applyBindingsToPlan(plan, state.on_yes_bindings);
  }

  if (plan.steps.length < 2) {
    return {
      reply: "Confirmed, but not enough steps remain to run a workflow.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  return startAndRunWorkflow(privyUserId, sessionId, plan, options);
}

export async function persistClarificationChatResponse(
  privyUserId: string,
  request: ChatRequest,
  outcome: WorkflowRunOutcome,
): Promise<ChatResponse> {
  return persistWorkflowChatResponse(privyUserId, request, outcome);
}

export function clarificationReplyPrefix(response: "yes" | "no"): string {
  return response === "yes" ? "Yes" : "No";
}

export function getWorkflowChatMode(): ChatResponse["mode"] {
  return getAgentProvider();
}
