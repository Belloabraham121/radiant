import { getDeepBookEnv } from "../../../config/deepbook.js";
import { getDeepBookPoolInfo } from "../../defi/deepbook-pools.service.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import type { QueryChainInput } from "../agent.types.js";
import type { ClarificationKind } from "./clarification.types.js";
import {
  CONFIDENCE_EXECUTE_THRESHOLD,
  type PlannerOutput,
  type PlannedStep,
  type PlanSlot,
} from "./planner.types.js";
import { formatLedgerRef, resolveParamsFromLedger, type WorkflowLedgerEntry } from "./workflow-ledger.js";
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
      question: string;
      step_index?: number;
      kind: ClarificationKind;
      confidence: number;
      on_yes_bindings?: Array<{ step_index: number; params: Record<string, unknown> }>;
      skip_step_indices?: number[];
    }
  | {
      status: "not_workflow";
    };

function isPlanSlot(value: unknown): value is PlanSlot {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ((value as PlanSlot).kind === "literal" ||
      (value as PlanSlot).kind === "ref" ||
      (value as PlanSlot).kind === "missing")
  );
}

function flattenParams(
  params: Record<string, PlanSlot | string | number | boolean>,
  ledger: WorkflowLedgerEntry[],
): { flat: Record<string, unknown>; unresolved: string[] } {
  const slotParams: Record<string, PlanSlot | string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    slotParams[key] = value;
  }
  const { resolved, unresolved } = resolveParamsFromLedger(slotParams, ledger);
  return { flat: resolved, unresolved };
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

  const input: ExecuteTransactionInput = {
    chain_id: "sui",
    action: step.action,
    params: { ...step.params },
  };

  return {
    step: { kind: "execute", label: step.label, input },
    unresolved,
  };
}

function buildPlanPreview(steps: WorkflowStep[]): string {
  return steps.map((step, index) => `${index + 1}. ${step.label}`).join("\n");
}

async function preflightStep(
  step: WorkflowStep,
): Promise<{ ok: boolean; clarify?: { question: string; kind: ClarificationKind } }> {
  if (step.kind !== "execute") {
    return { ok: true };
  }

  if (step.input.action === "deepbook_place_limit_order") {
    const quantity = step.input.params.quantity as number | undefined;
    const price = step.input.params.price as number | undefined;
    const poolKey =
      (step.input.params.pool_key as string | undefined) ?? getDeepBookEnv().defaultPool;

    if (price === undefined || !Number.isFinite(price)) {
      return {
        ok: false,
        clarify: {
          question: `What limit price should I use for ${step.label}?`,
          kind: "intent",
        },
      };
    }

    if (quantity !== undefined) {
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
  let firstUnresolved: { stepIndex: number; keys: string[] } | null = null;

  for (let index = 0; index < planner.steps.length; index += 1) {
    const converted = plannedToWorkflowStep(planner.steps[index], ledger);
    if (!converted.step) {
      return { status: "not_workflow" };
    }
    if (converted.unresolved.length > 0 && !firstUnresolved) {
      firstUnresolved = { stepIndex: index, keys: converted.unresolved };
    }
    workflowSteps.push(converted.step);
  }

  const plan: WorkflowPlan = {
    originalMessage,
    steps: workflowSteps,
  };

  if (planner.needs_clarification && planner.clarification) {
    return {
      status: "clarify",
      plan,
      question: planner.clarification.question,
      step_index: planner.clarification.step_index,
      kind: planner.clarification.kind,
      confidence: planner.confidence,
      skip_step_indices:
        planner.clarification.kind === "constraint_skip" &&
        planner.clarification.step_index !== undefined
          ? [planner.clarification.step_index]
          : undefined,
    };
  }

  if (planner.assumptions.length > 0 && planner.confidence < CONFIDENCE_EXECUTE_THRESHOLD) {
    const first = planner.assumptions[0];
    return {
      status: "clarify",
      plan,
      question: `Did you mean ${first.interpreted} (from "${first.from_phrase}")?`,
      step_index: 0,
      kind: "intent",
      confidence: planner.confidence,
    };
  }

  if (firstUnresolved) {
    const refStep = planner.steps[firstUnresolved.stepIndex];
    const amountSlot = refStep.params.amount_display;
    const refIndex =
      typeof amountSlot === "object" &&
      amountSlot !== null &&
      "kind" in amountSlot &&
      (amountSlot as PlanSlot).kind === "ref"
        ? (amountSlot as Extract<PlanSlot, { kind: "ref" }>).step_index
        : -1;
    const ledgerEntry = ledger.find((entry) => entry.step_index === refIndex);
    const refLabel = ledgerEntry ? formatLedgerRef(ledgerEntry) : "the previous step output";
    return {
      status: "clarify",
      plan,
      question: `Should I use ${refLabel} for ${refStep.label}?`,
      step_index: firstUnresolved.stepIndex,
      kind: "amount_ref",
      confidence: planner.confidence,
      on_yes_bindings: [
        {
          step_index: firstUnresolved.stepIndex,
          params: await resolveBindingsForStep(planner.steps[firstUnresolved.stepIndex], ledger),
        },
      ],
    };
  }

  if (planner.confidence < CONFIDENCE_EXECUTE_THRESHOLD) {
    return {
      status: "clarify",
      plan,
      question: `I'll run ${planner.steps.length} steps:\n${buildPlanPreview(workflowSteps)}\n\nDoes this match what you want?`,
      step_index: undefined,
      kind: "intent",
      confidence: planner.confidence,
    };
  }

  for (let index = 0; index < workflowSteps.length; index += 1) {
    const preflight = await preflightStep(workflowSteps[index]);
    if (!preflight.ok && preflight.clarify) {
      return {
        status: "clarify",
        plan,
        question: preflight.clarify.question,
        step_index: index,
        kind: preflight.clarify.kind,
        confidence: planner.confidence,
        skip_step_indices: preflight.clarify.kind === "constraint_skip" ? [index] : undefined,
      };
    }
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
