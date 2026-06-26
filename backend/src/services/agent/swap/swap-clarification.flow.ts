import {
  inferSwapSideForPool,
  resolveSwapPoolKey,
} from "../../defi/deepbook/pool-key.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
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
  applySwapClarificationAnswer,
  collectSwapClarificationGap,
  swapIntentPreview,
  swapIntentReadyForExecute,
  toSwapQuestionContext,
  withDefaultChain,
} from "./swap-clarification-gaps.js";
import {
  isHypotheticalSwapMessage,
  messageLooksLikeSwap,
  parsePartialSwapIntent,
} from "./swap-intent-parser.js";
import type { PartialSwapIntent } from "./swap-intent.types.js";
import {
  detectCrossChainSwapIntent,
  swapIntentToBridgeIntent,
} from "./token-chain-affinity.js";
import { executeResolvedSwapIntent } from "./swap-execute.js";
import {
  executeResolvedLifiSameChainSwap,
  isLifiSameChainSwapEligible,
} from "./swap-lifi-execute.js";
import {
  bridgeIntentPreview,
  bridgeIntentReadyForExecute,
  collectBridgeClarificationGap,
  toBridgeQuestionContext,
  withDefaultBridgeChains,
} from "../bridge/bridge-clarification-gaps.js";
import { executeResolvedBridgeIntent } from "../bridge/bridge-execute.js";

const EMPTY_WORKFLOW_PLAN: WorkflowPlan = { steps: [] };

async function startBridgeClarificationFromSwap(
  sessionId: string,
  bridgeIntent: ReturnType<typeof swapIntentToBridgeIntent>,
  gap: NonNullable<ReturnType<typeof collectBridgeClarificationGap>>,
): Promise<WorkflowRunOutcome> {
  const enrichedGap = await enrichGapWithSynthesizedQuestion(
    gap,
    toBridgeQuestionContext(bridgeIntent, gap),
  );
  const state = startSessionClarification({
    sessionId,
    gap: enrichedGap,
    plan: EMPTY_WORKFLOW_PLAN,
    context: "bridge_intent",
    bridgeIntent: withDefaultBridgeChains(bridgeIntent),
  });
  const pending = gapToPending(enrichedGap, state.id);
  return {
    reply: enrichedGap.question,
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: {
      ...pending,
      plan_preview: bridgeIntentPreview(bridgeIntent),
    },
    workflowCompleted: false,
  };
}

async function finishResolvedBridgeFromSwap(
  privyUserId: string,
  bridgeIntent: ReturnType<typeof swapIntentToBridgeIntent>,
  sessionId: string,
): Promise<WorkflowRunOutcome> {
  const resolved = withDefaultBridgeChains(bridgeIntent);
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

async function handleBridgeConfirmAnswer(
  privyUserId: string,
  sessionId: string,
  swapIntent: PartialSwapIntent,
  answer: ClarificationAnswer,
): Promise<WorkflowRunOutcome> {
  clearSessionClarification(sessionId);

  if (answer.confirm === "no") {
    return {
      reply:
        "No problem — pick tokens that both exist on the same network, or say \"bridge\" to move assets between chains.",
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
        reply: "I couldn't route that swap. Try rephrasing or say \"bridge\" explicitly.",
        tool_calls: [],
        pending_transaction: null,
        pending_clarification: null,
        workflowCompleted: true,
      };
    }
    const gap = collectSwapClarificationGap(withDefaultChain(swapIntent));
    if (gap) {
      return startSwapClarification(sessionId, swapIntent, gap);
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
      reply: "I couldn't route that swap anymore — try rephrasing or say \"bridge\" explicitly.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const bridgeIntent = swapIntentToBridgeIntent(swapIntent, mismatch);
  const nextGap = collectBridgeClarificationGap(withDefaultBridgeChains(bridgeIntent));
  if (nextGap) {
    return startBridgeClarificationFromSwap(sessionId, bridgeIntent, nextGap);
  }

  return finishResolvedBridgeFromSwap(privyUserId, bridgeIntent, sessionId);
}


function buildClarificationOutcome(
  question: string,
  clarificationId: string,
  gap: NonNullable<ReturnType<typeof collectSwapClarificationGap>>,
  intent: PartialSwapIntent,
): WorkflowRunOutcome {
  const pending = gapToPending(gap, clarificationId);
  return {
    reply: question,
    tool_calls: [],
    pending_transaction: null,
    pending_clarification: {
      ...pending,
      plan_preview: swapIntentPreview(intent),
    },
    workflowCompleted: false,
  };
}

async function startSwapClarification(
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
    context: "swap_intent",
    swapIntent: withDefaultChain(intent),
  });
  return buildClarificationOutcome(enrichedGap.question, state.id, enrichedGap, intent);
}

async function finishResolvedSwapIntent(
  privyUserId: string,
  resolved: PartialSwapIntent,
  sessionId: string,
): Promise<WorkflowRunOutcome> {
  if (!swapIntentReadyForExecute(resolved)) {
    return {
      reply: "I still need a bit more detail to run this swap. Try specifying both tokens and an amount.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  if (isLifiSameChainSwapEligible(resolved)) {
    const outcome = await executeResolvedLifiSameChainSwap(privyUserId, resolved, sessionId);
    if (!outcome) {
      return {
        reply: "I couldn't run that swap — check the tokens, network, and amount, then try again.",
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

  const crossChainGap = collectSwapClarificationGap(resolved);
  if (crossChainGap) {
    return startSwapClarification(sessionId, resolved, crossChainGap);
  }

  if (resolved.chainId !== "sui") {
    const networkLabel =
      resolved.chainId === "ethereum" && resolved.evmChainId !== undefined
        ? `EVM chain ${resolved.evmChainId}`
        : resolved.chainId;
    return {
      reply:
        `Got it — swap ${resolved.amount} ${resolved.inputCoin} → ${resolved.outputCoin} on ${networkLabel}. ` +
        "Quick swaps on Sui DeepBook are supported here; for other networks ask me to bridge or swap on that chain and I'll route it.",
      tool_calls: [],
      pending_transaction: null,
      pending_clarification: null,
      workflowCompleted: true,
    };
  }

  const outcome = await executeResolvedSwapIntent(privyUserId, resolved, sessionId);
  if (!outcome) {
    return {
      reply: "I couldn't run that swap — check the pool and amount, then try again.",
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

function shouldHandleSwapMessage(message: string): boolean {
  if (looksLikeWorkflowMessage(message)) {
    return false;
  }
  if (messageHasBuildAppIntent(message)) {
    return false;
  }
  return messageLooksLikeSwap(message) && !isHypotheticalSwapMessage(message);
}

export async function tryHandleSwapIntentFromMessage(
  privyUserId: string,
  message: string,
  sessionId: string,
): Promise<WorkflowRunOutcome | null> {
  if (!shouldHandleSwapMessage(message)) {
    return null;
  }

  const intent = parsePartialSwapIntent(message);
  if (!intent) {
    return null;
  }

  const resolved = withDefaultChain(intent);
  const gap = collectSwapClarificationGap(resolved);
  if (gap) {
    return startSwapClarification(sessionId, intent, gap);
  }

  if (!swapIntentReadyForExecute(resolved)) {
    return null;
  }

  return finishResolvedSwapIntent(privyUserId, resolved, sessionId);
}

export async function continueSwapClarification(
  privyUserId: string,
  sessionId: string,
  clarificationId: string,
  answer: ClarificationAnswer,
): Promise<WorkflowRunOutcome | null> {
  const state = getClarificationById(clarificationId);
  if (!state || state.sessionId !== sessionId || state.context !== "swap_intent") {
    return null;
  }
  if (!state.swapIntent) {
    return null;
  }

  if (state.gap.interaction_type === "confirm" && state.gap.field === "bridge_confirm") {
    return handleBridgeConfirmAnswer(privyUserId, sessionId, state.swapIntent, answer);
  }

  const applied = applySwapClarificationAnswer(state.swapIntent, state.gap, answer);
  if (!applied) {
    const retry = startSessionClarification({
      sessionId,
      gap: state.gap,
      plan: EMPTY_WORKFLOW_PLAN,
      context: "swap_intent",
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
    return startSwapClarification(sessionId, resolved, nextGap);
  }

  return finishResolvedSwapIntent(privyUserId, resolved, sessionId);
}

export function buildSwapExecuteInput(intent: PartialSwapIntent): ExecuteTransactionInput | null {
  const resolved = withDefaultChain(intent);
  if (!resolved.inputCoin || !resolved.outputCoin || resolved.amount === undefined) {
    return null;
  }

  const pool_key = resolveSwapPoolKey({
    fromCoin: resolved.inputCoin,
    toCoin: resolved.outputCoin,
  });
  let side = inferSwapSideForPool(resolved.inputCoin, resolved.outputCoin, pool_key);
  if (resolved.amountSide === "receive") {
    side = side === "sell" ? "buy" : "sell";
  }

  return {
    chain_id: "sui",
    action: "swap",
    params: {
      pool_key,
      amount: resolved.amount,
      side,
      input_coin: resolved.inputCoin,
      output_coin: resolved.outputCoin,
    },
  };
}
