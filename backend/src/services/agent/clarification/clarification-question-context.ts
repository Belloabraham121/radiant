import type { ClarificationInteractionType } from "../workflow/clarification.types.js";

export type ClarificationAction = "bridge" | "swap" | "workflow";

/** Canonical keys for facts already parsed from the user message. */
export type ClarificationKnownFacts = {
  from_chain?: string;
  to_chain?: string;
  network?: string;
  from_token?: string;
  to_token?: string;
  input_coin?: string;
  output_coin?: string;
  amount?: string;
  amount_unit?: string;
  amount_side?: string;
  /** Workflow step label from the planner. */
  step_label?: string;
  /** Execute action on the step (e.g. deepbook_deposit, deepbook_place_limit_order). */
  workflow_action?: string;
  pool_key?: string;
  coin_key?: string;
  quantity?: string;
  price?: string;
  margin_manager_key?: string;
};

export type ClarificationQuestionContext = {
  action: ClarificationAction;
  gap_id: string;
  field: string;
  interaction_type: ClarificationInteractionType;
  known: ClarificationKnownFacts;
  options?: Array<{ id: string; label: string }>;
  template_question: string;
  template_hint?: string;
};

export type ClarificationQuestionTemplate = {
  question: string;
  hint?: string;
};
