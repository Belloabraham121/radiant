import type { WorkflowPlan } from "./workflow.types.js";

export type ClarificationKind = "intent" | "amount_ref" | "constraint_skip";

export type ClarificationInteractionType =
  | "confirm"
  | "input"
  | "single_choice"
  | "multi_choice";

export type ClarificationOption = {
  id: string;
  label: string;
};

/** One missing or ambiguous slot on the plan — not a hardcoded scenario. */
export type ClarificationGap = {
  gap_id: string;
  interaction_type: ClarificationInteractionType;
  question: string;
  step_index: number;
  field?: string;
  action?: string;
  kind: ClarificationKind;
  input_kind?: "number" | "text";
  placeholder?: string;
  options?: ClarificationOption[];
  skip_step_indices_on_no?: number[];
};

export type PendingClarification = {
  id: string;
  gap_id: string;
  interaction_type: ClarificationInteractionType;
  question: string;
  step_index: number;
  field?: string;
  kind: ClarificationKind;
  input_kind?: "number" | "text";
  placeholder?: string;
  options?: ClarificationOption[];
  plan_preview?: string;
};

export type ClarificationAnswer = {
  confirm?: "yes" | "no";
  value?: string | number;
  selected_option_id?: string;
  selected_option_ids?: string[];
};

export type SessionClarificationState = {
  id: string;
  sessionId: string;
  gap: ClarificationGap;
  plan: WorkflowPlan;
  createdAt: number;
};
