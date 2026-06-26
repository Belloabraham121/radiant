import type { ClarificationGap } from "../workflow/clarification.types.js";
import type { WorkflowPlan } from "../workflow/workflow.types.js";
import type {
  ClarificationKnownFacts,
  ClarificationQuestionContext,
} from "./clarification-question-context.js";

function readParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function workflowStepParams(
  plan: WorkflowPlan,
  gap: ClarificationGap,
): { stepLabel: string; action: string; params: Record<string, unknown> } {
  const step = plan.steps[gap.step_index];
  const stepLabel = step?.label ?? `step ${gap.step_index + 1}`;

  if (step?.kind === "execute") {
    return {
      stepLabel,
      action: gap.action ?? step.input.action,
      params: step.input.params as Record<string, unknown>,
    };
  }

  return {
    stepLabel,
    action: gap.action ?? "workflow",
    params: {},
  };
}

export function buildWorkflowKnownFacts(
  plan: WorkflowPlan,
  gap: ClarificationGap,
): ClarificationKnownFacts {
  const { stepLabel, action, params } = workflowStepParams(plan, gap);
  const known: ClarificationKnownFacts = {
    step_label: stepLabel,
    workflow_action: action,
  };

  const poolKey = readParam(params, "pool_key");
  if (poolKey) {
    known.pool_key = poolKey;
  }
  const coinKey = readParam(params, "coin_key");
  if (coinKey) {
    known.coin_key = coinKey;
  }
  const inputCoin = readParam(params, "input_coin");
  if (inputCoin) {
    known.input_coin = inputCoin;
  }
  const outputCoin = readParam(params, "output_coin");
  if (outputCoin) {
    known.output_coin = outputCoin;
  }
  const amount = readParam(params, "amount") ?? readParam(params, "amount_display");
  if (amount) {
    known.amount = amount;
  }
  const quantity = readParam(params, "quantity");
  if (quantity) {
    known.quantity = quantity;
  }
  const price = readParam(params, "price");
  if (price) {
    known.price = price;
  }
  const marginManager = readParam(params, "margin_manager_key");
  if (marginManager) {
    known.margin_manager_key = marginManager;
  }

  return known;
}

export function toWorkflowQuestionContext(
  plan: WorkflowPlan,
  gap: ClarificationGap,
): ClarificationQuestionContext {
  return {
    action: "workflow",
    gap_id: gap.gap_id,
    field: gap.field ?? "unknown",
    interaction_type: gap.interaction_type,
    known: buildWorkflowKnownFacts(plan, gap),
    options: gap.options,
    template_question: gap.question,
    template_hint: gap.hint,
  };
}
