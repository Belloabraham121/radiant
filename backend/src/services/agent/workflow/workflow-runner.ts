import type { Prisma } from "@prisma/client";
import { getAgentProvider, getPromptScopeConfig } from "../../../config/agent.js";
import { extractWorkflowPromptModules } from "../prompts/prompt-context.js";
import type { AgentPromptContext } from "../prompts/prompt-context.js";
import type { TxResult } from "../../chains/types.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import type { ChatRequest, ChatResponse, ExecuteToolOutcome, ToolCallRecord } from "../agent.types.js";
import { resolveOrCreateSession } from "../../conversation/conversation.service.js";
import { appendMessage } from "../../conversation/message.repository.js";
import { touchSession } from "../../conversation/session.repository.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { CALL_APP_ACTION_TOOL_NAME } from "../../projects/call-app-action.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { parseAppActionParams } from "../../projects/app-action-mapper.js";
import { isOnchainAction } from "../../projects/app-action-registry.js";
import type { AppActionResult } from "../../projects/app-action.types.js";
import { getAgentRuntime } from "../runtime/index.js";
import { runAgentTool, type AgentToolErrorResult } from "../tools.js";
import { linkToolCallTransactionsToMessage } from "../../agent-transaction/link-transactions.js";
import { extractArtifactFromToolCalls } from "../../projects/extract-artifact.js";
import { startSessionClarification } from "./clarification.store.js";
import { persistSessionStateSnapshot } from "./agent-session-state.store.js";
import type { ClarificationAnswer, ClarificationGap, PendingClarification } from "./clarification.types.js";
import {
  applyClarificationAnswerWithSnapping,
  collectClarificationGaps,
  gapToPending,
} from "./workflow-clarification-gaps.js";
import {
  buildLimitOrderRetryGap,
  enrichClarificationGaps,
} from "./limit-order-clarification.js";
import { skipStepsInPlan } from "./workflow-plan-validator.js";
import {
  clearSessionWorkflow,
  getSessionWorkflow,
  startSessionWorkflow,
  updateSessionWorkflow,
} from "./session-workflow.store.js";
import { ledgerEntryFromToolCalls, resolveParamsFromLedger } from "./workflow-ledger.js";
import { evaluateStepDependency } from "../intent/step-dependency.js";
import { synthesizeWorkflowCompletionReply } from "./workflow-reply.js";
import {
  flattenPlannedParams,
  normalizeExecuteParams,
  validateExecuteStepParams,
} from "./workflow-param-normalizer.js";
import type {
  SessionWorkflowState,
  WorkflowPlan,
  WorkflowRunOutcome,
  WorkflowStep,
  WorkflowStepOutcome,
} from "./workflow.types.js";

function isExecuteOutcome(result: unknown): result is ExecuteToolOutcome {
  return (
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    ((result as ExecuteToolOutcome).status === "executed" ||
      (result as ExecuteToolOutcome).status === "approval_required")
  );
}

function isAppActionOutcome(result: unknown): result is AppActionResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    ((result as AppActionResult).status === "executed" ||
      (result as AppActionResult).status === "approval_required" ||
      (result as AppActionResult).status === "preview_delegated")
  );
}

function isToolError(result: unknown): result is AgentToolErrorResult {
  return typeof result === "object" && result !== null && "error" in result;
}

function stepProgressLabel(state: SessionWorkflowState, stepIndex: number): string {
  const total = state.plan.steps.length;
  return `Step ${stepIndex + 1} of ${total}`;
}

function buildCompletedStepsSummary(state: SessionWorkflowState): string {
  if (state.completed.length === 0) {
    return "";
  }
  return state.completed
    .map((entry) => {
      const digest = entry.digest ? ` (digest ${entry.digest})` : "";
      return `- ${entry.label}${digest}`;
    })
    .join("\n");
}

function buildAgentStepMessage(
  state: SessionWorkflowState,
  step: Extract<WorkflowStep, { kind: "agent" }>,
  stepIndex: number,
): string {
  const completed = buildCompletedStepsSummary(state);
  const header =
    `Multi-step workflow (${stepProgressLabel(state, stepIndex)}). ` +
    `Execute ONLY this remaining step — do not repeat earlier steps. ` +
    `Call tools directly; do not ask me to confirm in chat.\n\n` +
    `Original request: ${state.plan.originalMessage}\n`;

  const doneBlock = completed.length > 0 ? `Already completed:\n${completed}\n\n` : "";

  return `${header}${doneBlock}Current step: ${step.instruction}`;
}

function workflowPromptContext(
  state: SessionWorkflowState,
  userMessage: string,
): AgentPromptContext {
  const { workflowActions, workflowQueries } = extractWorkflowPromptModules(state.plan);
  return {
    userMessage,
    mode: getPromptScopeConfig().mode,
    workflowActions,
    workflowQueries,
  };
}

async function runBuildWorkflowStep(
  privyUserId: string,
  sessionId: string,
  state: SessionWorkflowState,
  step: Extract<WorkflowStep, { kind: "build" }>,
  stepIndex: number,
  memoryBlock?: string,
  agentPermissions?: AgentPermissions,
): Promise<WorkflowStepOutcome> {
  const runtime = getAgentRuntime();
  const context = buildAgentStepMessage(state, { kind: "agent", label: step.label, instruction: step.instruction }, stepIndex);
  const userContent =
    `BUILD MODE — create or update a UI in the artifact panel using generate_app only. ` +
    `Do NOT call execute_transaction.\n\n${context}`;
  const result = await runtime.runTurn({
    privyUserId,
    sessionId,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
    memoryBlock,
    agentPermissions,
    workflowMode: true,
    promptContext: workflowPromptContext(state, userContent),
  });

  return {
    status: "executed",
    tool_calls: result.tool_calls,
  };
}

async function runAgentWorkflowStep(
  privyUserId: string,
  sessionId: string,
  state: SessionWorkflowState,
  step: Extract<WorkflowStep, { kind: "agent" }>,
  stepIndex: number,
  memoryBlock?: string,
  agentPermissions?: AgentPermissions,
): Promise<WorkflowStepOutcome> {
  const runtime = getAgentRuntime();
  const userContent = buildAgentStepMessage(state, step, stepIndex);
  const result = await runtime.runTurn({
    privyUserId,
    sessionId,
    messages: [{ role: "user", content: userContent }],
    memoryBlock,
    agentPermissions,
    workflowMode: true,
    promptContext: workflowPromptContext(state, userContent),
  });

  let tool_calls = [...result.tool_calls];

  if (result.pending_transaction) {
    const hasExecute = tool_calls.some((call) => call.name === EXECUTE_TRANSACTION_TOOL_NAME);
    if (!hasExecute) {
      tool_calls = [
        ...tool_calls,
        {
          name: EXECUTE_TRANSACTION_TOOL_NAME,
          result: {
            status: "approval_required" as const,
            pending: result.pending_transaction,
          },
        },
      ];
    }
    return {
      status: "approval_required",
      tool_calls,
      pendingId: result.pending_transaction.id,
    };
  }

  const executeCall = tool_calls.find((call) => call.name === EXECUTE_TRANSACTION_TOOL_NAME);

  if (executeCall && isToolError(executeCall.result)) {
    return {
      status: "error",
      tool_calls: result.tool_calls,
      error: executeCall.result.error,
    };
  }

  if (executeCall && isExecuteOutcome(executeCall.result)) {
    if (executeCall.result.status === "approval_required") {
      return {
        status: "approval_required",
        tool_calls: result.tool_calls,
        pendingId: executeCall.result.pending.id,
      };
    }
    return {
      status: "executed",
      tool_calls: result.tool_calls,
      txResult: executeCall.result.result,
    };
  }

  return {
    status: "executed",
    tool_calls: result.tool_calls,
  };
}

function resolveExecuteInput(
  input: ExecuteTransactionInput,
  ledger: import("./workflow-ledger.js").WorkflowLedgerEntry[],
): { input: ExecuteTransactionInput; unresolved: string[] } {
  const { flat, unresolved } = flattenPlannedParams(
    input.params as Record<string, unknown>,
    ledger,
  );
  const normalized = normalizeExecuteParams(input.action, flat);

  return {
    input: { ...input, params: normalized },
    unresolved,
  };
}

async function executeWorkflowStep(
  privyUserId: string,
  sessionId: string,
  state: SessionWorkflowState,
  step: WorkflowStep,
  stepIndex: number,
  memoryBlock?: string,
  agentPermissions?: AgentPermissions,
): Promise<WorkflowStepOutcome> {
  if (step.kind === "build") {
    return runBuildWorkflowStep(
      privyUserId,
      sessionId,
      state,
      step,
      stepIndex,
      memoryBlock,
      agentPermissions,
    );
  }

  if (step.kind === "query") {
    const result = await runAgentTool(privyUserId, QUERY_CHAIN_TOOL_NAME, step.input, {
      sessionId,
    });
    const tool_calls: ToolCallRecord[] = [{ name: QUERY_CHAIN_TOOL_NAME, result }];
    if (isToolError(result)) {
      return { status: "error", tool_calls, error: result.error };
    }
    return { status: "executed", tool_calls };
  }

  if (step.kind === "app_action") {
    const { resolved, unresolved } = resolveParamsFromLedger(
      step.params as Record<string, import("./planner.types.js").PlanSlot | string | number | boolean>,
      state.ledger,
    );
    if (unresolved.length > 0) {
      const gap: ClarificationGap = {
        gap_id: `step${stepIndex}.runtime.ref`,
        interaction_type: "confirm",
        question: `Should I use the output from a previous step for ${step.label}?`,
        step_index: stepIndex,
        kind: "amount_ref",
      };
      const clarificationState = startSessionClarification({
        sessionId,
        gap,
        plan: state.plan,
      });
      updateSessionWorkflow(sessionId, {
        status: "paused_clarification",
        pendingClarificationId: clarificationState.id,
      });
      const pending = gapToPending(gap, clarificationState.id);
      return {
        status: "clarification_required" as const,
        pending,
      };
    }

    if (isOnchainAction(step.action)) {
      try {
        parseAppActionParams(step.action, resolved);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid app action parameters";
        return {
          status: "error",
          tool_calls: [],
          error: { code: "VALIDATION_ERROR", message },
        };
      }
    }

    const toolInput = {
      ...(step.project_id
        ? { project_id: step.project_id }
        : step.installation_id
          ? { installation_id: step.installation_id }
          : step.app_name
            ? { app_name: step.app_name }
            : { use_session_draft: true }),
      action: step.action,
      params: resolved,
    };

    const result = await runAgentTool(privyUserId, CALL_APP_ACTION_TOOL_NAME, toolInput, {
      sessionId,
      workflowStepIndex: stepIndex,
    });
    const tool_calls: ToolCallRecord[] = [
      { name: CALL_APP_ACTION_TOOL_NAME, action: step.action, result },
    ];

    if (isToolError(result)) {
      return { status: "error", tool_calls, error: result.error };
    }

    const outcome = result as AppActionResult;
    if (outcome.status === "error") {
      return {
        status: "error",
        tool_calls,
        error: outcome.error,
      };
    }
    if (outcome.status === "approval_required") {
      return {
        status: "approval_required",
        tool_calls,
        pendingId: outcome.agent_transaction_id,
      };
    }
    if (outcome.status === "preview_delegated") {
      return {
        status: "executed",
        tool_calls,
        txResult: undefined,
      };
    }
    return {
      status: "executed",
      tool_calls,
      txResult: outcome.result,
    };
  }

  if (step.kind === "execute") {
    const { input: resolvedInput, unresolved } = resolveExecuteInput(step.input, state.ledger);
    if (unresolved.length > 0) {
      const gap: ClarificationGap = {
        gap_id: `step${stepIndex}.runtime.ref`,
        interaction_type: "confirm",
        question: `Should I use the output from a previous step for ${step.label}?`,
        step_index: stepIndex,
        kind: "amount_ref",
      };
      const clarificationState = startSessionClarification({
        sessionId,
        gap,
        plan: state.plan,
      });
      updateSessionWorkflow(sessionId, {
        status: "paused_clarification",
        pendingClarificationId: clarificationState.id,
      });
      const pending = gapToPending(gap, clarificationState.id);
      return {
        status: "clarification_required" as const,
        pending,
      };
    }

    const paramCheck = validateExecuteStepParams(resolvedInput.action, resolvedInput.params);
    if (!paramCheck.ok) {
      return {
        status: "error",
        tool_calls: [],
        error: { code: "VALIDATION_ERROR", message: paramCheck.message },
      };
    }

    const result = await runAgentTool(privyUserId, EXECUTE_TRANSACTION_TOOL_NAME, resolvedInput, {
      sessionId,
      workflowStepIndex: stepIndex,
    });
    const tool_calls: ToolCallRecord[] = [{ name: EXECUTE_TRANSACTION_TOOL_NAME, result }];
    if (isToolError(result)) {
      return { status: "error", tool_calls, error: result.error };
    }
    if (!isExecuteOutcome(result)) {
      return {
        status: "error",
        tool_calls,
        error: { code: "WORKFLOW_ERROR", message: "Unexpected execute_transaction outcome" },
      };
    }
    if (result.status === "approval_required") {
      return {
        status: "approval_required",
        tool_calls,
        pendingId: result.pending.id,
      };
    }
    return { status: "executed", tool_calls, txResult: result.result };
  }

  return runAgentWorkflowStep(
    privyUserId,
    sessionId,
    state,
    step,
    stepIndex,
    memoryBlock,
    agentPermissions,
  );
}

function buildPausedReply(state: SessionWorkflowState, step: WorkflowStep): string {
  const remaining = state.plan.steps.length - state.currentStepIndex - 1;
  const base = `This transaction needs your approval before I can continue (${stepProgressLabel(state, state.currentStepIndex)}: ${step.label}).`;
  if (remaining > 0) {
    return `${base} After you approve, I'll run the next ${remaining} step${remaining === 1 ? "" : "s"} automatically.`;
  }
  return base;
}

function buildCompletedReply(state: SessionWorkflowState): string {
  const lines = state.completed.map((entry, index) => {
    const digest = entry.digest ? ` — ${entry.digest}` : "";
    return `${index + 1}. ${entry.label}${digest}`;
  });
  return `All ${state.plan.steps.length} steps completed:\n${lines.join("\n")}`;
}

function buildStepSuccessReply(
  state: SessionWorkflowState,
  step: WorkflowStep,
  txResult?: TxResult,
): string {
  const digest = txResult?.digest ? ` Digest: ${txResult.digest}.` : "";
  const remaining = state.plan.steps.length - state.currentStepIndex;
  if (remaining <= 0) {
    return buildCompletedReply(state);
  }
  return (
    `${stepProgressLabel(state, state.currentStepIndex - 1)} complete (${step.label}).${digest} ` +
    `Continuing with step ${state.currentStepIndex + 1}…`
  );
}

export async function runWorkflowFromStep(
  privyUserId: string,
  sessionId: string,
  startIndex: number,
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
    silentIntermediateReplies?: boolean;
  },
): Promise<WorkflowRunOutcome> {
  const state = getSessionWorkflow(sessionId);
  if (!state) {
    return {
      reply: "No active workflow for this session.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: false,
    };
  }

  const allToolCalls: ToolCallRecord[] = [];
  let lastReply = "";
  const skippedSteps: Array<{ index: number; label: string; reason: string }> = [];

  for (let index = startIndex; index < state.plan.steps.length; index += 1) {
    const freshState = getSessionWorkflow(sessionId);
    if (!freshState) {
      break;
    }

    const step = freshState.plan.steps[index];

    if (step.depends_on) {
      const decision = evaluateStepDependency(freshState.completed, step.depends_on);
      if (decision.action === "skip") {
        const skipEntry = {
          index,
          label: step.label,
          tool_calls: [] as ToolCallRecord[],
          status: "skipped" as const,
          skip_reason: decision.reason,
        };
        skippedSteps.push({ index, label: step.label, reason: decision.reason });
        updateSessionWorkflow(sessionId, {
          currentStepIndex: index + 1,
          completed: [...freshState.completed, skipEntry],
        });
        continue;
      }
    }

    updateSessionWorkflow(sessionId, { currentStepIndex: index, status: "active" });

    const outcome = await executeWorkflowStep(
      privyUserId,
      sessionId,
      freshState,
      step,
      index,
      options?.memoryBlock,
      options?.agentPermissions,
    );

    if (outcome.status === "clarification_required") {
      return {
        reply: outcome.pending.question,
        tool_calls: allToolCalls,
        pending_transaction: null,
        pending_clarification: outcome.pending,
        workflowCompleted: false,
      };
    }

    allToolCalls.push(...outcome.tool_calls);

    if (outcome.status === "approval_required") {
      const pending = await resolvePendingFromOutcome(outcome);
      updateSessionWorkflow(sessionId, {
        status: "paused_approval",
        pendingTransactionId: pending.id,
        currentStepIndex: index,
      });

      return {
        reply: buildPausedReply({ ...freshState, currentStepIndex: index }, step),
        tool_calls: allToolCalls,
        pending_transaction: pending,
        pending_clarification: null,
        workflowCompleted: false,
      };
    }

    if (outcome.status === "error") {
      const retryGap = await buildLimitOrderRetryGap(freshState.plan, index, outcome.error.message);
      if (retryGap) {
        const clarificationState = startSessionClarification({
          sessionId,
          gap: retryGap,
          plan: freshState.plan,
        });
        updateSessionWorkflow(sessionId, {
          status: "paused_clarification",
          pendingClarificationId: clarificationState.id,
          currentStepIndex: index,
        });
        const pending = gapToPending(retryGap, clarificationState.id);
        return {
          reply: retryGap.question,
          tool_calls: allToolCalls,
          pending_transaction: null,
          pending_clarification: pending,
          workflowCompleted: false,
        };
      }

      updateSessionWorkflow(sessionId, {
        status: "failed",
        failureMessage: outcome.error.message,
      });
      return {
        reply:
          `${stepProgressLabel(freshState, index)} failed (${step.label}): ${outcome.error.message}. ` +
          `${freshState.completed.length} step(s) completed before the failure.`,
        tool_calls: allToolCalls,
        pending_transaction: null,
        pending_clarification: null,
        workflowCompleted: false,
      };
    }

    const digest = outcome.txResult?.digest;
    const ledgerAction =
      step.kind === "execute"
        ? step.input.action
        : step.kind === "app_action"
          ? step.action
          : step.kind === "query"
            ? "query"
            : "agent";
    const ledgerParams =
      step.kind === "execute"
        ? step.input.params
        : step.kind === "app_action"
          ? step.params
          : {};
    const ledgerEntry = ledgerEntryFromToolCalls(
      index,
      ledgerAction,
      ledgerParams,
      outcome.tool_calls,
      outcome.txResult,
    );

    const completedEntry = {
      index,
      label: step.label,
      tool_calls: outcome.tool_calls,
      digest,
      status: "executed" as const,
    };

    const updated = updateSessionWorkflow(sessionId, {
      completed: [...freshState.completed, completedEntry],
      currentStepIndex: index + 1,
      ledger: [...freshState.ledger, ledgerEntry],
    });

    lastReply = buildStepSuccessReply(
      {
        ...freshState,
        completed: updated?.completed ?? [...freshState.completed, completedEntry],
        currentStepIndex: index + 1,
      },
      step,
      outcome.txResult,
    );

    if (options?.silentIntermediateReplies && index + 1 < freshState.plan.steps.length) {
      continue;
    }
  }

  const finalState = getSessionWorkflow(sessionId);
  const completionReply = finalState
    ? synthesizeWorkflowCompletionReply(finalState.completed, skippedSteps)
    : "Workflow completed.";

  updateSessionWorkflow(sessionId, { status: "completed" });
  clearSessionWorkflow(sessionId);

  return {
    reply: options?.silentIntermediateReplies ? completionReply : lastReply || completionReply,
    tool_calls: allToolCalls,
    pending_transaction: null,
    pending_clarification: null,
    workflowCompleted: true,
  };
}

async function resolvePendingFromOutcome(
  outcome: Extract<WorkflowStepOutcome, { status: "approval_required" }>,
) {
  const appActionCall = outcome.tool_calls.find(
    (call) => call.name === CALL_APP_ACTION_TOOL_NAME,
  );
  if (
    appActionCall &&
    isAppActionOutcome(appActionCall.result) &&
    appActionCall.result.status === "approval_required"
  ) {
    return appActionCall.result.pending;
  }

  const executeCall = outcome.tool_calls.find(
    (call) => call.name === EXECUTE_TRANSACTION_TOOL_NAME,
  );
  if (
    executeCall &&
    isExecuteOutcome(executeCall.result) &&
    executeCall.result.status === "approval_required"
  ) {
    return executeCall.result.pending;
  }

  throw new Error("Workflow approval_required without pending transaction");
}

export async function continueWorkflowAfterMidRunClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  gap: ClarificationGap,
  answer: ClarificationAnswer,
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
  },
): Promise<WorkflowRunOutcome | null> {
  const state = getSessionWorkflow(sessionId);
  if (!state || state.status !== "paused_clarification") {
    return null;
  }
  if (state.pendingClarificationId !== clarificationId) {
    return null;
  }

  const applied = await applyClarificationAnswerWithSnapping(state.plan, gap, answer);
  if (applied === null) {
    const clarificationState = startSessionClarification({
      sessionId,
      gap,
      plan: state.plan,
    });
    updateSessionWorkflow(sessionId, {
      status: "paused_clarification",
      pendingClarificationId: clarificationState.id,
    });
    const pending = gapToPending(gap, clarificationState.id);
    return {
      reply: `I didn't understand that answer. ${gap.question}`,
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: pending,
      workflowCompleted: false,
    };
  }

  if ("skip_step_indices" in applied) {
    if (applied.skip_step_indices.length === 0) {
      clearSessionWorkflow(sessionId);
      return {
        reply: "Understood — I won't run those steps.",
        tool_calls: [],
        pending_transaction: null,
        pending_clarification: null,
        workflowCompleted: true,
      };
    }

    const trimmed = skipStepsInPlan(state.plan, applied.skip_step_indices);
    if (trimmed.steps.length === 0 || state.currentStepIndex >= trimmed.steps.length) {
      clearSessionWorkflow(sessionId);
      return {
        reply: "Understood — not enough steps remain to continue the workflow.",
        tool_calls: [],
        pending_transaction: null,
        pending_clarification: null,
        workflowCompleted: true,
      };
    }

    updateSessionWorkflow(sessionId, {
      plan: trimmed,
      status: "active",
      pendingClarificationId: undefined,
    });
    return runWorkflowFromStep(privyUserId, sessionId, state.currentStepIndex, options);
  }

  const normalizedPlan = applied;
  const gaps = await enrichClarificationGaps(
    normalizedPlan,
    collectClarificationGaps(normalizedPlan),
  );
  if (gaps.length > 0) {
    const nextGap = gaps[0];
    const clarificationState = startSessionClarification({
      sessionId,
      gap: nextGap,
      plan: normalizedPlan,
    });
    updateSessionWorkflow(sessionId, {
      plan: normalizedPlan,
      status: "paused_clarification",
      pendingClarificationId: clarificationState.id,
    });
    const pending = gapToPending(nextGap, clarificationState.id);
    return {
      reply: nextGap.question,
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: pending,
      workflowCompleted: false,
    };
  }

  updateSessionWorkflow(sessionId, {
    plan: normalizedPlan,
    status: "active",
    pendingClarificationId: undefined,
  });
  return runWorkflowFromStep(privyUserId, sessionId, state.currentStepIndex, options);
}

export async function startAndRunWorkflow(
  privyUserId: string,
  sessionId: string,
  plan: WorkflowPlan,
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
  },
): Promise<WorkflowRunOutcome> {
  startSessionWorkflow(sessionId, plan);
  return runWorkflowFromStep(privyUserId, sessionId, 0, {
    ...options,
    silentIntermediateReplies: true,
  });
}

export async function continueWorkflowAfterApproval(
  privyUserId: string,
  sessionId: string,
  completedTx: TxResult,
  pendingTransactionId: string,
  options?: {
    memoryBlock?: string;
    agentPermissions?: AgentPermissions;
  },
): Promise<WorkflowRunOutcome | null> {
  const state = getSessionWorkflow(sessionId);
  if (!state || state.status !== "paused_approval") {
    return null;
  }

  if (state.pendingTransactionId !== pendingTransactionId) {
    return null;
  }

  const stepIndex = state.currentStepIndex;
  const step = state.plan.steps[stepIndex];
  if (!step) {
    return null;
  }

  const approvedToolName =
    step.kind === "app_action" ? CALL_APP_ACTION_TOOL_NAME : EXECUTE_TRANSACTION_TOOL_NAME;

  const completedEntry = {
    index: stepIndex,
    label: step.label,
    tool_calls: [
      {
        name: approvedToolName,
        ...(step.kind === "app_action" ? { action: step.action } : {}),
        result: { status: "executed" as const, result: completedTx },
      },
    ],
    digest: completedTx.digest,
  };

  updateSessionWorkflow(sessionId, {
    completed: [...state.completed, completedEntry],
    currentStepIndex: stepIndex + 1,
    status: "active",
    pendingTransactionId: undefined,
    ledger: [
      ...state.ledger,
      ledgerEntryFromToolCalls(
        stepIndex,
        step.kind === "execute"
          ? step.input.action
          : step.kind === "app_action"
            ? step.action
            : "execute",
        step.kind === "execute"
          ? step.input.params
          : step.kind === "app_action"
            ? step.params
            : {},
        completedEntry.tool_calls,
        completedTx,
      ),
    ],
  });

  const continuation = await runWorkflowFromStep(privyUserId, sessionId, stepIndex + 1, {
    ...options,
    silentIntermediateReplies: true,
  });

  const baseToolCall = {
    name: approvedToolName,
    ...(step.kind === "app_action" ? { action: step.action } : {}),
    result: { status: "executed" as const, result: completedTx },
  };

  if (continuation.workflowCompleted) {
    return {
      ...continuation,
      tool_calls: [baseToolCall, ...continuation.tool_calls],
      reply:
        `Step ${stepIndex + 1} approved and submitted (digest ${completedTx.digest}).\n\n` +
        continuation.reply,
    };
  }

  if (continuation.pending_transaction) {
    return {
      ...continuation,
      tool_calls: [baseToolCall, ...continuation.tool_calls],
      reply:
        `Step ${stepIndex + 1} approved and submitted (digest ${completedTx.digest}). ` +
        continuation.reply,
    };
  }

  return {
    ...continuation,
    tool_calls: [baseToolCall, ...continuation.tool_calls],
    reply:
      `Step ${stepIndex + 1} approved and submitted (digest ${completedTx.digest}). ` +
      continuation.reply,
  };
}

export function isApprovalContinuationMessage(message: string): boolean {
  return /^approve\s+transaction$/i.test(message.trim());
}

export function isClarificationContinuationMessage(message: string): boolean {
  return /^(yes|no)$/i.test(message.trim());
}

export async function persistWorkflowChatResponse(
  privyUserId: string,
  request: ChatRequest,
  outcome: WorkflowRunOutcome,
): Promise<ChatResponse> {
  const { session } = await resolveOrCreateSession(privyUserId, request.session_id);

  if (
    request.clarification_id ||
    isApprovalContinuationMessage(request.message) ||
    isClarificationContinuationMessage(request.message)
  ) {
    const userMessage = request.clarification_id
      ? request.message?.trim() || "Answered"
      : request.message;
    await appendMessage(session.id, "user", userMessage);
  }

  const toolCallsJson: Prisma.InputJsonValue | undefined =
    outcome.tool_calls.length > 0 ? (outcome.tool_calls as Prisma.InputJsonValue) : undefined;

  const assistantMessage = await appendMessage(
    session.id,
    "assistant",
    outcome.reply,
    toolCallsJson,
  );

  await linkToolCallTransactionsToMessage(outcome.tool_calls, assistantMessage.id);

  await touchSession(session.id, { updated_at: new Date() });

  // Snapshot any pending clarification / paused workflow so a continuation
  // request can recover it after a restart or on another instance.
  await persistSessionStateSnapshot(session.id);

  return {
    reply: outcome.reply,
    session_id: session.id,
    mode: getAgentProvider(),
    tool_calls: outcome.tool_calls,
    pending_transaction: outcome.pending_transaction,
    pending_clarification: outcome.pending_clarification,
    message_id: assistantMessage.id,
    artifact: extractArtifactFromToolCalls(outcome.tool_calls),
  };
}
