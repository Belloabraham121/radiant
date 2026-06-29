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
} from "../bridge/bridge-clarification-gaps.js";
import {
  isHypotheticalBridgeMessage,
  isSameEvmChainBridgeIntent,
  messageLooksLikeBridge,
  parsePartialBridgeIntent,
} from "../bridge/bridge-intent-parser.js";
import type { PartialBridgeIntent } from "../bridge/bridge-intent.types.js";
import {
  applySwapClarificationAnswer,
  collectSwapClarificationGap,
  swapIntentPreview,
  swapIntentReadyForExecute,
  toSwapQuestionContext,
  withDefaultChain,
} from "../swap/swap-clarification-gaps.js";
import {
  isHypotheticalSwapMessage,
  messageLooksLikeSwap,
  parsePartialSwapIntent,
} from "../swap/swap-intent-parser.js";
import type { PartialSwapIntent } from "../swap/swap-intent.types.js";
import {
  detectCrossChainSwapIntent,
  swapIntentToBridgeIntent,
} from "../swap/token-chain-affinity.js";
import {
  detectSquidTestMode,
  isSquidIntentTestEnabled,
  messageLooksLikeSquidTestIntent,
  stripSquidTestPrefix,
  type SquidTestIntentMode,
} from "./squid-intent-parser.js";
import {
  executeResolvedSquidBridgeIntent,
  executeResolvedSquidSwapIntent,
} from "./squid-execute.js";

const EMPTY_WORKFLOW_PLAN: WorkflowPlan = { steps: [], originalMessage: "" };

function bridgeIntentToSwapIntent(intent: PartialBridgeIntent): PartialSwapIntent {
  return {
    originalMessage: intent.originalMessage,
    amount: intent.amount,
    amountUnit: intent.amountUnit,
    amountUnitConfirmed: intent.amountUnitConfirmed,
    inputCoin: intent.fromToken,
    outputCoin: intent.toToken,
    chainId: intent.fromChainId,
    evmChainId: intent.fromEvmChainId,
  };
}

function shouldRouteSquidBridgeAsSwap(intent: PartialBridgeIntent): boolean {
  if (!isSameEvmChainBridgeIntent(intent)) {
    return false;
  }
  if (!intent.fromToken || !intent.toToken) {
    return false;
  }
  return intent.fromToken.toUpperCase() !== intent.toToken.toUpperCase();
}

async function finishSquidBridgeOrSameChainSwap(
  privyUserId: string,
  resolved: PartialBridgeIntent,
  sessionId: string,
): Promise<WorkflowRunOutcome> {
  if (shouldRouteSquidBridgeAsSwap(resolved)) {
    return finishResolvedSquidSwapIntent(
      privyUserId,
      bridgeIntentToSwapIntent(resolved),
      sessionId,
    );
  }
  return finishResolvedSquidBridgeIntent(privyUserId, resolved, sessionId);
}

function shouldHandleSquidTestMessage(message: string): boolean {
  if (looksLikeWorkflowMessage(message)) {
    return false;
  }
  if (messageHasBuildAppIntent(message)) {
    return false;
  }
  return messageLooksLikeSquidTestIntent(message);
}

async function finishResolvedSquidBridgeIntent(
  privyUserId: string,
  resolved: PartialBridgeIntent,
  sessionId: string,
): Promise<WorkflowRunOutcome> {
  if (!bridgeIntentReadyForExecute(resolved)) {
    return {
      reply: "I still need a bit more detail to run this Squid bridge. Try specifying both chains, tokens, and an amount.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const outcome = await executeResolvedSquidBridgeIntent(privyUserId, resolved, sessionId);
  if (!outcome) {
    return {
      reply: "I couldn't run that Squid bridge — check the chains, tokens, and amount, then try again.",
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

async function finishResolvedSquidSwapIntent(
  privyUserId: string,
  resolved: PartialSwapIntent,
  sessionId: string,
): Promise<WorkflowRunOutcome> {
  if (!swapIntentReadyForExecute(resolved)) {
    return {
      reply: "I still need a bit more detail to run this Squid swap. Try specifying both tokens and an amount.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const outcome = await executeResolvedSquidSwapIntent(privyUserId, resolved, sessionId);
  if (!outcome) {
    return {
      reply: "I couldn't run that Squid swap — check the tokens, network, and amount, then try again.",
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

async function startSquidBridgeClarification(
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
    context: "squid_test_intent",
    squidTestMode: "bridge",
    bridgeIntent: withDefaultBridgeChains(intent),
  });
  const pending = gapToPending(enrichedGap, state.id);
  return {
    reply: enrichedGap.question,
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: {
      ...pending,
      plan_preview: bridgeIntentPreview(intent),
    },
    workflowCompleted: false,
  };
}

async function startSquidSwapClarification(
  sessionId: string,
  intent: PartialSwapIntent,
  gap: NonNullable<ReturnType<typeof collectSwapClarificationGap>>,
): Promise<WorkflowRunOutcome> {
  const enrichedGap = await enrichGapWithSynthesizedQuestion(
    gap,
    toSwapQuestionContext(intent, gap),
  );
  const state = startSessionClarification({
    sessionId,
    gap: enrichedGap,
    plan: EMPTY_WORKFLOW_PLAN,
    context: "squid_test_intent",
    squidTestMode: "swap",
    swapIntent: withDefaultChain(intent),
  });
  const pending = gapToPending(enrichedGap, state.id);
  return {
    reply: enrichedGap.question,
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: {
      ...pending,
      plan_preview: swapIntentPreview(intent),
    },
    workflowCompleted: false,
  };
}

async function handleSquidSwapBridgeConfirmAnswer(
  privyUserId: string,
  sessionId: string,
  swapIntent: PartialSwapIntent,
  answer: ClarificationAnswer,
): Promise<WorkflowRunOutcome> {
  clearSessionClarification(sessionId);

  if (answer.confirm === "no") {
    return {
      reply:
        "No problem — pick tokens on the same network, or say \"squid bridge\" to move assets between chains via Squid.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  if (answer.confirm !== "yes") {
    const mismatch = detectCrossChainSwapIntent(swapIntent);
    if (!mismatch) {
      return {
        reply: "I couldn't route that Squid swap. Try rephrasing or say \"squid bridge\" explicitly.",
        tool_calls: [],
        pending_transaction: null,
        pending_clarification: null,
        workflowCompleted: true,
      };
    }
    const gap = collectSwapClarificationGap(withDefaultChain(swapIntent));
    if (gap) {
      return startSquidSwapClarification(sessionId, swapIntent, gap);
    }
    return {
      reply: "I didn't understand that answer. Please choose Yes or No.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const mismatch = detectCrossChainSwapIntent(swapIntent);
  if (!mismatch) {
    return {
      reply: "I couldn't route that Squid swap anymore — try rephrasing or say \"squid bridge\" explicitly.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const bridgeIntent = swapIntentToBridgeIntent(swapIntent, mismatch);
  const nextGap = collectBridgeClarificationGap(withDefaultBridgeChains(bridgeIntent));
  if (nextGap) {
    return startSquidBridgeClarification(sessionId, bridgeIntent, nextGap);
  }

  return finishSquidBridgeOrSameChainSwap(
    privyUserId,
    withDefaultBridgeChains(bridgeIntent),
    sessionId,
  );
}

async function tryHandleSquidBridgeTestIntent(
  privyUserId: string,
  strippedMessage: string,
  sessionId: string,
): Promise<WorkflowRunOutcome | null> {
  if (!messageLooksLikeBridge(strippedMessage) || isHypotheticalBridgeMessage(strippedMessage)) {
    return null;
  }

  const intent = parsePartialBridgeIntent(strippedMessage);
  if (!intent) {
    return null;
  }

  const resolved = withDefaultBridgeChains(intent);
  const gap = collectBridgeClarificationGap(resolved);
  if (gap) {
    return startSquidBridgeClarification(sessionId, intent, gap);
  }

  if (!bridgeIntentReadyForExecute(resolved)) {
    return null;
  }

  return finishSquidBridgeOrSameChainSwap(privyUserId, resolved, sessionId);
}

async function tryHandleSquidSwapTestIntent(
  privyUserId: string,
  strippedMessage: string,
  sessionId: string,
): Promise<WorkflowRunOutcome | null> {
  if (!messageLooksLikeSwap(strippedMessage) || isHypotheticalSwapMessage(strippedMessage)) {
    return null;
  }

  const intent = parsePartialSwapIntent(strippedMessage);
  if (!intent) {
    return null;
  }

  const resolved = withDefaultChain(intent);
  const gap = collectSwapClarificationGap(resolved);
  if (gap) {
    return startSquidSwapClarification(sessionId, intent, gap);
  }

  if (!swapIntentReadyForExecute(resolved)) {
    return null;
  }

  return finishResolvedSquidSwapIntent(privyUserId, resolved, sessionId);
}

export async function tryHandleSquidTestIntentFromMessage(
  privyUserId: string,
  message: string,
  sessionId: string,
): Promise<WorkflowRunOutcome | null> {
  if (!isSquidIntentTestEnabled()) {
    return null;
  }
  if (!shouldHandleSquidTestMessage(message)) {
    return null;
  }

  const mode = detectSquidTestMode(message);
  if (!mode) {
    return null;
  }

  const strippedMessage = stripSquidTestPrefix(message);
  if (mode === "bridge") {
    return tryHandleSquidBridgeTestIntent(privyUserId, strippedMessage, sessionId);
  }
  return tryHandleSquidSwapTestIntent(privyUserId, strippedMessage, sessionId);
}

async function continueSquidBridgeTestClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  answer: ClarificationAnswer,
  state: NonNullable<ReturnType<typeof getClarificationById>>,
): Promise<WorkflowRunOutcome | null> {
  if (!state.bridgeIntent) {
    return null;
  }

  const applied = applyBridgeClarificationAnswer(state.bridgeIntent, state.gap, answer);
  if (!applied) {
    const retry = startSessionClarification({
      sessionId,
      gap: state.gap,
      plan: EMPTY_WORKFLOW_PLAN,
      context: "squid_test_intent",
      squidTestMode: "bridge",
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
    return startSquidBridgeClarification(sessionId, resolved, nextGap);
  }

  return finishSquidBridgeOrSameChainSwap(privyUserId, resolved, sessionId);
}

async function continueSquidSwapTestClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  answer: ClarificationAnswer,
  state: NonNullable<ReturnType<typeof getClarificationById>>,
): Promise<WorkflowRunOutcome | null> {
  if (!state.swapIntent) {
    return null;
  }

  if (state.gap.interaction_type === "confirm" && state.gap.field === "bridge_confirm") {
    return handleSquidSwapBridgeConfirmAnswer(privyUserId, sessionId, state.swapIntent, answer);
  }

  const applied = applySwapClarificationAnswer(state.swapIntent, state.gap, answer);
  if (!applied) {
    const retry = startSessionClarification({
      sessionId,
      gap: state.gap,
      plan: EMPTY_WORKFLOW_PLAN,
      context: "squid_test_intent",
      squidTestMode: "swap",
      swapIntent: state.swapIntent,
    });
    const pending = gapToPending(state.gap, retry.id);
    return {
      reply: `I didn't understand that answer. ${state.gap.question}`,
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: {
        ...pending,
        plan_preview: swapIntentPreview(state.swapIntent),
      },
      workflowCompleted: false,
    };
  }

  clearSessionClarification(sessionId);

  const resolved = withDefaultChain(applied);
  const nextGap = collectSwapClarificationGap(resolved);
  if (nextGap) {
    return startSquidSwapClarification(sessionId, resolved, nextGap);
  }

  return finishResolvedSquidSwapIntent(privyUserId, resolved, sessionId);
}

export async function continueSquidTestClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  answer: ClarificationAnswer,
): Promise<WorkflowRunOutcome | null> {
  const state = getClarificationById(clarificationId);
  if (!state || state.sessionId !== sessionId || state.context !== "squid_test_intent") {
    return null;
  }

  const mode: SquidTestIntentMode = state.squidTestMode ?? "bridge";
  if (mode === "bridge") {
    return continueSquidBridgeTestClarification(
      privyUserId,
      sessionId,
      clarificationId,
      answer,
      state,
    );
  }
  return continueSquidSwapTestClarification(
    privyUserId,
    sessionId,
    clarificationId,
    answer,
    state,
  );
}
