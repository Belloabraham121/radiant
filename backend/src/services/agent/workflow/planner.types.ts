export type PlanSlot =
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "ref"; step_index: number; field: "output_amount" | "output_coin" }
  | { kind: "missing" };

import type { StepDependency } from "../intent/step-dependency.js";

export type PlannedAction =
  | "deepbook_deposit"
  | "deepbook_withdraw"
  | "deepbook_provision_manager"
  | "deepbook_place_limit_order"
  | "deepbook_place_market_order"
  | "deepbook_cancel_order"
  | "deepbook_cancel_all_orders"
  | "swap"
  | "transfer_sui"
  | "query"
  | "build";

export type PlannedStep = {
  action: PlannedAction;
  label: string;
  params: Record<string, PlanSlot | string | number | boolean>;
  depends_on?: StepDependency;
  /** When set, on-chain steps run through call_app_action instead of execute_transaction. */
  project_id?: string;
  installation_id?: string;
};

export type PlannerAssumption = {
  field: string;
  interpreted: string;
  from_phrase: string;
};

export type PlannerClarification = {
  question: string;
  step_index?: number;
  kind: "intent" | "amount_ref" | "constraint_skip";
};

export type PlannerOutput = {
  is_multi_step: boolean;
  steps: PlannedStep[];
  assumptions: PlannerAssumption[];
  confidence: number;
  needs_clarification: boolean;
  clarification?: PlannerClarification;
};

export const CONFIDENCE_EXECUTE_THRESHOLD = 0.9;
