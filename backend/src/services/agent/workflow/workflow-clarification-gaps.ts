import type { ClarificationAnswer, ClarificationGap, PendingClarification } from "./clarification.types.js";
import type { PlannerAssumption } from "./planner.types.js";
import { CONFIDENCE_EXECUTE_THRESHOLD } from "./planner.types.js";
import {
  coercePositiveNumber,
  flattenPlannedParams,
  normalizeWorkflowPlan,
  validateExecuteStepParams,
} from "./workflow-param-normalizer.js";
import type { WorkflowPlan } from "./workflow.types.js";

type FieldMeta = {
  field: string;
  label: string;
  input_kind: "number" | "text";
  placeholder?: string;
};

const ACTION_FIELDS: Record<string, FieldMeta[]> = {
  swap: [{ field: "amount", label: "swap amount", input_kind: "number", placeholder: "e.g. 1.6" }],
  deepbook_deposit: [
    {
      field: "amount_display",
      label: "deposit amount",
      input_kind: "number",
      placeholder: "e.g. 1.2",
    },
    { field: "coin_key", label: "coin", input_kind: "text", placeholder: "e.g. SUI" },
  ],
  deepbook_withdraw: [
    { field: "coin_key", label: "coin", input_kind: "text", placeholder: "e.g. SUI" },
  ],
  deepbook_place_limit_order: [
    {
      field: "quantity",
      label: "order quantity",
      input_kind: "number",
      placeholder: "e.g. 1.1",
    },
    {
      field: "price",
      label: "limit price",
      input_kind: "number",
      placeholder: "e.g. 2.05",
    },
  ],
  deepbook_place_market_order: [
    {
      field: "quantity",
      label: "order quantity",
      input_kind: "number",
      placeholder: "e.g. 1.0",
    },
  ],
  transfer_sui: [
    {
      field: "amount_display",
      label: "transfer amount",
      input_kind: "number",
      placeholder: "e.g. 0.5",
    },
  ],
};

function fieldMeta(action: string, field: string): FieldMeta {
  const specs = ACTION_FIELDS[action] ?? [];
  return (
    specs.find((spec) => spec.field === field) ?? {
      field,
      label: field.replace(/_/g, " "),
      input_kind: "number",
    }
  );
}

function buildInputQuestion(stepLabel: string, meta: FieldMeta): string {
  return `What ${meta.label} should I use for "${stepLabel}"?`;
}

function isFieldMissing(action: string, field: string, params: Record<string, unknown>): boolean {
  const value = params[field];
  if (field === "coin_key") {
    return typeof value !== "string" || value.trim().length === 0;
  }
  if (action === "deepbook_withdraw" && field === "amount_display" && params.withdraw_all === true) {
    return false;
  }
  return coercePositiveNumber(value) === undefined;
}

export type CollectGapsOptions = {
  assumptions?: PlannerAssumption[];
  confidence?: number;
  constraintGaps?: ClarificationGap[];
};

export function collectClarificationGaps(
  plan: WorkflowPlan,
  options: CollectGapsOptions = {},
): ClarificationGap[] {
  const gaps: ClarificationGap[] = [];

  if (
    options.assumptions &&
    options.assumptions.length > 0 &&
    (options.confidence ?? 1) < CONFIDENCE_EXECUTE_THRESHOLD
  ) {
    const first = options.assumptions[0];
    gaps.push({
      gap_id: `assumption.${first.field}`,
      interaction_type: "confirm",
      question: `Did you mean ${first.interpreted} (from "${first.from_phrase}")?`,
      step_index: 0,
      kind: "intent",
    });
  }

  const normalizedPlan = normalizeWorkflowPlan(plan);

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    if (step.kind !== "execute") {
      continue;
    }

    const action = step.input.action;
    const params = step.input.params as Record<string, unknown>;
    const { unresolved } = flattenPlannedParams(params, []);

    for (const field of unresolved) {
      const meta = fieldMeta(action, field);
      gaps.push({
        gap_id: `step${index}.${field}.ref`,
        interaction_type: "confirm",
        question: `Should I use the output from a previous step for ${meta.label} on "${step.label}"?`,
        step_index: index,
        field,
        action,
        kind: "amount_ref",
      });
    }

    const normalizedStep = normalizedPlan.steps[index];
    if (normalizedStep.kind !== "execute") {
      continue;
    }
    const normalizedParams = normalizedStep.input.params as Record<string, unknown>;

    const specs = ACTION_FIELDS[action] ?? [];
    for (const spec of specs) {
      if (isFieldMissing(action, spec.field, normalizedParams)) {
        gaps.push({
          gap_id: `step${index}.${spec.field}`,
          interaction_type: "input",
          question: buildInputQuestion(step.label, spec),
          step_index: index,
          field: spec.field,
          action,
          kind: "intent",
          input_kind: spec.input_kind,
          placeholder: spec.placeholder,
        });
      }
    }

    const validation = validateExecuteStepParams(action, normalizedParams);
    if (!validation.ok) {
      const alreadyQueued = gaps.some(
        (gap) => gap.step_index === index && gap.field === validation.field,
      );
      if (!alreadyQueued) {
        const meta = fieldMeta(action, validation.field);
        gaps.push({
          gap_id: `step${index}.${validation.field}`,
          interaction_type: "input",
          question: buildInputQuestion(step.label, meta),
          step_index: index,
          field: validation.field,
          action,
          kind: "intent",
          input_kind: meta.input_kind,
          placeholder: meta.placeholder,
        });
      }
    }
  }

  if (options.constraintGaps) {
    for (const constraint of options.constraintGaps) {
      if (!gaps.some((gap) => gap.gap_id === constraint.gap_id)) {
        gaps.push(constraint);
      }
    }
  }

  const seen = new Set<string>();
  return gaps.filter((gap) => {
    if (seen.has(gap.gap_id)) {
      return false;
    }
    seen.add(gap.gap_id);
    return true;
  });
}

export function gapToPending(gap: ClarificationGap, clarificationId: string): PendingClarification {
  return {
    id: clarificationId,
    gap_id: gap.gap_id,
    interaction_type: gap.interaction_type,
    question: gap.question,
    step_index: gap.step_index,
    field: gap.field,
    kind: gap.kind,
    input_kind: gap.input_kind,
    placeholder: gap.placeholder,
    options: gap.options,
  };
}

export function applyClarificationAnswer(
  plan: WorkflowPlan,
  gap: ClarificationGap,
  answer: ClarificationAnswer,
): WorkflowPlan | { skip_step_indices: number[] } | null {
  if (gap.interaction_type === "confirm") {
    if (answer.confirm === "no") {
      const skip =
        gap.skip_step_indices_on_no ??
        (gap.kind === "constraint_skip" || gap.kind === "amount_ref"
          ? [gap.step_index]
          : gap.gap_id === "plan.preview" || gap.gap_id.startsWith("assumption.")
            ? plan.steps.map((_, index) => index)
            : []);
      return { skip_step_indices: skip };
    }
    if (answer.confirm !== "yes") {
      return null;
    }
    if (gap.kind === "amount_ref" && gap.field) {
      const step = plan.steps[gap.step_index];
      if (step.kind !== "execute") {
        return plan;
      }
      const steps = plan.steps.map((s, index) => {
        if (index !== gap.step_index || s.kind !== "execute") {
          return s;
        }
        return { ...s };
      });
      return { ...plan, steps };
    }
    return plan;
  }

  if (gap.interaction_type === "input") {
    if (answer.value === undefined || answer.value === "") {
      return null;
    }
    const raw = answer.value;
    const value =
      gap.input_kind === "number"
        ? coercePositiveNumber(raw)
        : typeof raw === "string"
          ? raw.trim().toUpperCase()
          : raw;
    if (value === undefined || value === "") {
      return null;
    }
    if (!gap.field) {
      return null;
    }
    const steps = plan.steps.map((s, index) => {
      if (index !== gap.step_index || s.kind !== "execute") {
        return s;
      }
      return {
        ...s,
        input: {
          ...s.input,
          params: { ...s.input.params, [gap.field!]: value },
        },
      };
    });
    return { ...plan, steps };
  }

  if (gap.interaction_type === "single_choice") {
    if (!answer.selected_option_id || !gap.options?.length) {
      return null;
    }
    if (gap.field) {
      const steps = plan.steps.map((s, index) => {
        if (index !== gap.step_index || s.kind !== "execute") {
          return s;
        }
        return {
          ...s,
          input: {
            ...s.input,
            params: { ...s.input.params, [gap.field!]: answer.selected_option_id },
          },
        };
      });
      return { ...plan, steps };
    }
    return plan;
  }

  if (gap.interaction_type === "multi_choice") {
    if (!answer.selected_option_ids?.length) {
      return null;
    }
    return plan;
  }

  return null;
}

export function formatClarificationUserMessage(answer: ClarificationAnswer): string {
  if (answer.confirm) {
    return answer.confirm === "yes" ? "Yes" : "No";
  }
  if (answer.value !== undefined) {
    return String(answer.value);
  }
  if (answer.selected_option_id) {
    return answer.selected_option_id;
  }
  if (answer.selected_option_ids?.length) {
    return answer.selected_option_ids.join(", ");
  }
  return "Answered";
}

export function buildPlanPreview(plan: WorkflowPlan): string {
  return plan.steps.map((step, index) => `${index + 1}. ${step.label}`).join("\n");
}
