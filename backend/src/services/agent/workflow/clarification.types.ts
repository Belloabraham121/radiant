import type { WorkflowPlan } from "./workflow.types.js";

export type ClarificationKind = "intent" | "amount_ref" | "constraint_skip";

export type PendingClarification = {
  id: string;
  question: string;
  step_index?: number;
  kind: ClarificationKind;
  plan_preview?: string;
};

export type ClarificationBinding = {
  step_index: number;
  params: Record<string, unknown>;
};

export type SessionClarificationState = {
  id: string;
  sessionId: string;
  question: string;
  step_index?: number;
  kind: ClarificationKind;
  plan: WorkflowPlan;
  /** Params to merge into step on yes */
  on_yes_bindings?: ClarificationBinding[];
  /** Step indices to skip on no (default: [step_index]) */
  skip_step_indices?: number[];
  createdAt: number;
};
