import { getDeepBookEnv } from "../../../config/deepbook.js";
import { getDeepBookPoolInfo } from "../../defi/deepbook-pools.service.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import type { QueryChainInput } from "../agent.types.js";
import type { ClarificationGap, ClarificationKind } from "./clarification.types.js";
import {
  collectClarificationGaps,
  type CollectGapsOptions,
} from "./workflow-clarification-gaps.js";
import {
  CONFIDENCE_EXECUTE_THRESHOLD,
  type PlannerOutput,
  type PlannedStep,
  type PlanSlot,
} from "./planner.types.js";
import type { WorkflowLedgerEntry } from "./workflow-ledger.js";
import {
  flattenPlannedParams,
  normalizeExecuteParams,
  validateExecuteStepParams,
} from "./workflow-param-normalizer.js";
import type { WorkflowPlan, WorkflowStep } from "./workflow.types.js";

export type PlanValidationResult =
  | {
      status: "ready";
      plan: WorkflowPlan;
      confidence: number;
    }
  | {
      status: "clarify";
      plan: WorkflowPlan;
      gap: ClarificationGap;
      confidence: number;
    }
  | {
      status: "not_workflow";
    };

function flattenParams(
  params: Record<string, PlanSlot | string | number | boolean>,
  ledger: WorkflowLedgerEntry[],
): { flat: Record<string, unknown>; unresolved: string[] } {
  const raw: Record<string, unknown> = { ...params };
  return flattenPlannedParams(raw, ledger);
}

function plannedToWorkflowStep(
  step: PlannedStep,
  ledger: WorkflowLedgerEntry[],
): { step: WorkflowStep | null; unresolved: string[] } {
  const { flat, unresolved } = flattenParams(step.params, ledger);

  if (step.action === "query") {
    const query = flat.query as QueryChainInput["query"];
    if (!query) {
      return { step: null, unresolved: ["query"] };
    }
    const input: QueryChainInput = {
      chain_id: "sui",
      query,
      params: Object.fromEntries(
        Object.entries(flat).filter(([key]) => key !== "query"),
      ) as QueryChainInput["params"],
    };
    return { step: { kind: "query", label: step.label, input }, unresolved };
  }

  const normalized = normalizeExecuteParams(step.action, flat);

  const input: ExecuteTransactionInput = {
    chain_id: "sui",
    action: step.action,
    params: normalized,
  };

  return {
    step: { kind: "execute", label: step.label, input },
    unresolved,
  };
}

function buildPlanPreview(steps: WorkflowStep[]): string {
  return steps.map((step, index) => `${index + 1}. ${step.label}`).join("\n");
}

async function collectConstraintGaps(
  workflowSteps: WorkflowStep[],
): Promise<ClarificationGap[]> {
  const gaps: ClarificationGap[] = [];
  for (let index = 0; index < workflowSteps.length; index += 1) {
    const preflight = await preflightStep(workflowSteps[index]);
    if (!preflight.ok && preflight.clarify) {
      gaps.push({
        gap_id: `step${index}.constraint`,
        interaction_type: "confirm",
        question: preflight.clarify.question,
        step_index: index,
        kind: preflight.clarify.kind,
        skip_step_indices_on_no: preflight.clarify.kind === "constraint_skip" ? [index] : undefined,
      });
    }
  }
  return gaps;
}

async function preflightStep(
  step: WorkflowStep,
): Promise<{ ok: boolean; clarify?: { question: string; kind: ClarificationKind } }> {
  if (step.kind !== "execute") {
    return { ok: true };
  }

  const validation = validateExecuteStepParams(step.input.action, step.input.params);
  if (!validation.ok) {
    return { ok: true };
  }

  if (step.input.action === "deepbook_place_limit_order") {
    const quantity = step.input.params.quantity as number | undefined;
    const price = step.input.params.price as number | undefined;
    const poolKey =
      (step.input.params.pool_key as string | undefined) ?? getDeepBookEnv().defaultPool;

    if (quantity !== undefined && price !== undefined && Number.isFinite(price)) {
      try {
        const info = await getDeepBookPoolInfo(poolKey);
        const minSize = info.on_chain?.min_size;
        if (minSize !== undefined && quantity < minSize) {
          return {
            ok: false,
            clarify: {
              question: `${quantity} is below the pool minimum order size of ${minSize} ${info.base_coin}. Skip this order step?`,
              kind: "constraint_skip",
            },
          };
        }
      } catch {
        // Pool lookup failed — let execute-time validation handle it
      }
    }
  }

  return { ok: true };
}

export async function validatePlannerOutput(
  planner: PlannerOutput,
  originalMessage: string,
  ledger: WorkflowLedgerEntry[] = [],
): Promise<PlanValidationResult> {
  if (!planner.is_multi_step || planner.steps.length < 2) {
    return { status: "not_workflow" };
  }

  const workflowSteps: WorkflowStep[] = [];

  for (let index = 0; index < planner.steps.length; index += 1) {
    const converted = plannedToWorkflowStep(planner.steps[index], ledger);
    if (!converted.step) {
      return { status: "not_workflow" };
    }
    workflowSteps.push(converted.step);
  }

  const plan: WorkflowPlan = {
    originalMessage,
    steps: workflowSteps,
  };

  const gapOptions: CollectGapsOptions = {
    assumptions: planner.assumptions,
    confidence: planner.confidence,
    constraintGaps: await collectConstraintGaps(workflowSteps),
  };

  if (planner.confidence < CONFIDENCE_EXECUTE_THRESHOLD && planner.assumptions.length === 0) {
    gapOptions.constraintGaps = [
      ...(gapOptions.constraintGaps ?? []),
      {
        gap_id: "plan.preview",
        interaction_type: "confirm",
        question: `I'll run ${planner.steps.length} steps:\n${buildPlanPreview(workflowSteps)}\n\nDoes this match what you want?`,
        step_index: 0,
        kind: "intent",
      },
    ];
  }

  const gaps = collectClarificationGaps(plan, gapOptions);
  if (gaps.length > 0) {
    return {
      status: "clarify",
      plan,
      gap: gaps[0],
      confidence: planner.confidence,
    };
  }

  return {
    status: "ready",
    plan,
    confidence: planner.confidence,
  };
}

async function resolveBindingsForStep(
  step: PlannedStep,
  ledger: WorkflowLedgerEntry[],
): Promise<Record<string, unknown>> {
  const { flat } = flattenParams(step.params, ledger);
  return flat;
}

export function applyBindingsToPlan(
  plan: WorkflowPlan,
  bindings: Array<{ step_index: number; params: Record<string, unknown> }>,
): WorkflowPlan {
  const steps = plan.steps.map((step, index) => {
    const binding = bindings.find((item) => item.step_index === index);
    if (!binding || step.kind !== "execute") {
      return step;
    }
    return {
      ...step,
      input: {
        ...step.input,
        params: { ...step.input.params, ...binding.params },
      },
    };
  });

  return { ...plan, steps };
}

export function skipStepsInPlan(plan: WorkflowPlan, skipIndices: number[]): WorkflowPlan {
  const skip = new Set(skipIndices);
  return {
    ...plan,
    steps: plan.steps.filter((_, index) => !skip.has(index)),
  };
}
