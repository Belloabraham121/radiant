import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateStepDependency } from "../../../src/services/agent/intent/step-dependency.js";
import type { CompletedWorkflowStep } from "../../../src/services/agent/workflow/workflow.types.js";

describe("step-dependency", () => {
  it("skips when prior step is missing and only_if_success is true", () => {
    const decision = evaluateStepDependency([], {
      after_step_index: 0,
      only_if_success: true,
    });
    assert.equal(decision.action, "skip");
  });

  it("allows when prior execute step succeeded", () => {
    const completed: CompletedWorkflowStep[] = [
      {
        index: 0,
        label: "Swap",
        tool_calls: [{ name: "execute_transaction", result: { status: "executed", result: {} } }],
        status: "executed",
      },
    ];
    const decision = evaluateStepDependency(completed, {
      after_step_index: 0,
      only_if_success: true,
    });
    assert.equal(decision.action, "run");
  });

  it("skips execute when flash loan quote is not feasible", () => {
    const completed: CompletedWorkflowStep[] = [
      {
        index: 0,
        label: "Flash loan quote",
        tool_calls: [
          {
            name: "query_chain",
            result: { repay_feasible: false, pool_key: "SUI_USDC" },
          },
        ],
        status: "executed",
      },
    ];
    const decision = evaluateStepDependency(completed, {
      after_step_index: 0,
      only_if_success: true,
      only_if_condition: "flash_loan_feasible",
    });
    assert.equal(decision.action, "skip");
    if (decision.action === "skip") {
      assert.match(decision.reason, /not repay-feasible/i);
    }
  });
});
