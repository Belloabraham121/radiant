import type { ToolCallRecord } from "../agent.types.js";
import type { CompletedWorkflowStep } from "../workflow/workflow.types.js";

export type StepCondition = "success" | "flash_loan_feasible";

export type StepDependency = {
  after_step_index: number;
  only_if_success?: boolean;
  only_if_condition?: StepCondition;
};

export type DependencyDecision =
  | { action: "run" }
  | { action: "skip"; reason: string };

function isFlashLoanQuoteFeasible(toolCalls: ToolCallRecord[]): boolean {
  for (const call of toolCalls) {
    const result = call.result;
    if (typeof result !== "object" || result === null) {
      continue;
    }
    if ("repay_feasible" in result && result.repay_feasible === true) {
      return true;
    }
  }
  return false;
}

function priorStepSucceeded(
  completed: CompletedWorkflowStep[],
  stepIndex: number,
): boolean {
  const entry = completed.find((item) => item.index === stepIndex);
  if (!entry) {
    return false;
  }
  return entry.status !== "skipped";
}

export function evaluateStepDependency(
  completed: CompletedWorkflowStep[],
  dependsOn: StepDependency,
): DependencyDecision {
  const prior = completed.find((item) => item.index === dependsOn.after_step_index);
  if (!prior) {
    if (dependsOn.only_if_success ?? true) {
      return {
        action: "skip",
        reason: `Step ${dependsOn.after_step_index + 1} has not completed yet.`,
      };
    }
    return { action: "run" };
  }

  if (prior.status === "skipped") {
    return {
      action: "skip",
      reason: `Skipped because step ${dependsOn.after_step_index + 1} was skipped (${prior.skip_reason ?? "dependency not met"}).`,
    };
  }

  if (dependsOn.only_if_success ?? true) {
    if (!priorStepSucceeded(completed, dependsOn.after_step_index)) {
      return {
        action: "skip",
        reason: `Skipped because step ${dependsOn.after_step_index + 1} did not succeed.`,
      };
    }
  }

  if (dependsOn.only_if_condition === "flash_loan_feasible") {
    if (!isFlashLoanQuoteFeasible(prior.tool_calls)) {
      return {
        action: "skip",
        reason: `Skipped because the flash loan quote in step ${dependsOn.after_step_index + 1} is not repay-feasible.`,
      };
    }
  }

  return { action: "run" };
}
