import { isLifiEnabled } from "../../../config/lifi.js";
import type { ClarificationAnswer } from "../workflow/clarification.types.js";
import { enrichGapWithSynthesizedQuestion } from "../clarification/intent-clarification-runner.js";
import { gapToPending } from "../workflow/workflow-clarification-gaps.js";
import {
  clearSessionClarification,
  getClarificationById,
  startSessionClarification,
} from "../workflow/clarification.store.js";
import type { WorkflowPlan, WorkflowRunOutcome } from "../workflow/workflow.types.js";
import { looksLikeWorkflowMessage } from "../workflow/heuristic-planner.js";
import { messageHasBuildAppIntent } from "../workflow/workflow-parser.js";
import {
  applyBridgeClarificationAnswer,
  bridgeIntentPreview,
  bridgeIntentReadyForExecute,
  collectBridgeClarificationGap,
  toBridgeQuestionContext,
  withDefaultBridgeChains,
} from "./bridge-clarification-gaps.js";
import {
  isHypotheticalBridgeMessage,
  messageLooksLikeBridge,
  parsePartialBridgeIntent,
} from "./bridge-intent-parser.js";
import type { PartialBridgeIntent } from "./bridge-intent.types.js";
import { executeResolvedBridgeIntent } from "./bridge-execute.js";

const EMPTY_WORKFLOW_PLAN: WorkflowPlan = { steps: [] };

function buildClarificationOutcome(
  question: string,
  clarificationId: string,
  gap: NonNullable<ReturnType<typeof collectBridgeClarificationGap>>,
  intent: PartialBridgeIntent,
): WorkflowRunOutcome {
  const pending = gapToPending(gap, clarificationId);
  return {
    reply: question,
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: {
      ...pending,
      plan_preview: bridgeIntentPreview(intent),
    },
    workflowCompleted: false,
  };
}

async function startBridgeClarification(
  sessionId: string,
  intent: PartialBridgeIntent,
  gap: NonNullable<ReturnType<typeof collectBridgeClarificationGap>>,
): Promise<WorkflowRunOutcome> {
  const enrichedGap = await enrichGapWithSynthesizedQuestion(
    gap,
    toBridgeQuestionContext(intent, gap),
  );
  const state = startSessionClarification({
    sessionId,
    gap: enrichedGap,
    plan: EMPTY_WORKFLOW_PLAN,
    context: "bridge_intent",
    bridgeIntent: withDefaultBridgeChains(intent),
  });
  return buildClarificationOutcome(enrichedGap.question, state.id, enrichedGap, intent);
}

async function finishResolvedBridgeIntent(
  privyUserId: string,
  resolved: PartialBridgeIntent,
  sessionId: string,
): Promise<WorkflowRunOutcome> {
  if (!bridgeIntentReadyForExecute(resolved)) {
    return {
      reply: "I still need a bit more detail to run this bridge. Try specifying both chains, tokens, and an amount.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const outcome = await executeResolvedBridgeIntent(privyUserId, resolved, sessionId);
  if (!outcome) {
    return {
      reply: "I couldn't run that bridge — check the chains, tokens, and amount, then try again.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  return {
    reply: outcome.reply,
    tool_calls: outcome.tool_calls,
    pending_transaction: outcome.pending_transaction,
    pending_clarification: null,
    workflowCompleted: true,
  };
}

function shouldHandleBridgeMessage(message: string): boolean {
  if (looksLikeWorkflowMessage(message)) {
    return false;
  }
  if (messageHasBuildAppIntent(message)) {
    return false;
  }
  return messageLooksLikeBridge(message) && !isHypotheticalBridgeMessage(message);
}

export async function tryHandleBridgeIntentFromMessage(
  privyUserId: string,
  message: string,
  sessionId: string,
): Promise<WorkflowRunOutcome | null> {
  if (!isLifiEnabled()) {
    return null;
  }
  if (!shouldHandleBridgeMessage(message)) {
    return null;
  }

  const intent = parsePartialBridgeIntent(message);
  if (!intent) {
    return null;
  }

  const resolved = withDefaultBridgeChains(intent);
  const gap = collectBridgeClarificationGap(resolved);
  if (gap) {
    return startBridgeClarification(sessionId, intent, gap);
  }

  if (!bridgeIntentReadyForExecute(resolved)) {
    return null;
  }

  return finishResolvedBridgeIntent(privyUserId, resolved, sessionId);
}

export async function continueBridgeClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  answer: ClarificationAnswer,
): Promise<WorkflowRunOutcome | null> {
  const state = getClarificationById(clarificationId);
  if (!state || state.sessionId !== sessionId || state.context !== "bridge_intent") {
    return null;
  }
  if (!state.bridgeIntent) {
    return null;
  }

  if (state.gap.field === "stellar_unsupported") {
    clearSessionClarification(sessionId);
    return {
      reply: state.gap.question,
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const applied = applyBridgeClarificationAnswer(state.bridgeIntent, state.gap, answer);
  if (!applied) {
    const retry = startSessionClarification({
      sessionId,
      gap: state.gap,
      plan: EMPTY_WORKFLOW_PLAN,
      context: "bridge_intent",
      bridgeIntent: state.bridgeIntent,
    });
    const pending = gapToPending(state.gap, retry.id);
    return {
      reply: `I didn't understand that answer. ${state.gap.question}`,
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: {
        ...pending,
        plan_preview: bridgeIntentPreview(state.bridgeIntent),
      },
      workflowCompleted: false,
    };
  }

  clearSessionClarification(sessionId);

  const resolved = withDefaultBridgeChains(applied);
  const nextGap = collectBridgeClarificationGap(resolved);
  if (nextGap) {
    return startBridgeClarification(sessionId, resolved, nextGap);
  }

  return finishResolvedBridgeIntent(privyUserId, resolved, sessionId);
}
