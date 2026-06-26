import type { PartialBridgeIntent } from "../bridge/bridge-intent.types.js";
import { toBridgeQuestionContext } from "../bridge/bridge-clarification-gaps.js";
import type { PartialSwapIntent } from "../swap/swap-intent.types.js";
import { toSwapQuestionContext } from "../swap/swap-clarification-gaps.js";
import type { WorkflowPlan } from "../workflow/workflow.types.js";
import type { IntentClarificationPlugin } from "./intent-clarification.types.js";
import { toWorkflowQuestionContext } from "./workflow-clarification-context.js";

export const bridgeClarificationPlugin: IntentClarificationPlugin<PartialBridgeIntent> = {
  action: "bridge",
  toQuestionContext: toBridgeQuestionContext,
};

export const swapClarificationPlugin: IntentClarificationPlugin<PartialSwapIntent> = {
  action: "swap",
  toQuestionContext: toSwapQuestionContext,
};

/** Planner-driven multi-step workflows (deposit, withdraw, limit orders, etc.). */
export const workflowClarificationPlugin: IntentClarificationPlugin<WorkflowPlan> = {
  action: "workflow",
  toQuestionContext: toWorkflowQuestionContext,
};

/**
 * Roadmap — dedicated intent fast paths (not implemented yet):
 * - margin: PartialMarginIntent + collectMarginClarificationGap → marginClarificationPlugin
 * - flash_loan: PartialFlashLoanIntent + collectFlashLoanClarificationGap → flashLoanClarificationPlugin
 * Today margin/flash loan use the full LLM agent (tool calls) or multi-step planner only.
 */
