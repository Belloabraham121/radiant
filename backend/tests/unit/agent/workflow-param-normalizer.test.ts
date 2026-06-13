import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flattenPlannedParams,
  normalizeExecuteParams,
  validateExecuteStepParams,
} from "../../../src/services/agent/workflow/workflow-param-normalizer.js";
import { validatePlannerOutput } from "../../../src/services/agent/workflow/workflow-plan-validator.js";
import type { PlannerOutput } from "../../../src/services/agent/workflow/planner.types.js";

describe("workflow-param-normalizer", () => {
  it("unwraps PlanSlot literal amounts for swap", () => {
    const { flat } = flattenPlannedParams({
      amount: { kind: "literal", value: 1.6 },
      side: "sell",
      input_coin: "SUI",
      output_coin: "USDC",
    });
    const normalized = normalizeExecuteParams("swap", flat);
    assert.equal(normalized.amount, 1.6);
  });

  it("coerces string amounts", () => {
    const normalized = normalizeExecuteParams("swap", {
      amount: "1.6",
      side: "sell",
    });
    assert.equal(normalized.amount, 1.6);
  });

  it("rejects swap without amount", () => {
    const result = validateExecuteStepParams("swap", { side: "sell", input_coin: "SUI" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /positive amount/i);
    }
  });

  it("validates planner output with PlanSlot literals before execute", async () => {
    const planner: PlannerOutput = {
      is_multi_step: true,
      confidence: 0.95,
      needs_clarification: false,
      assumptions: [],
      steps: [
        {
          action: "swap",
          label: "Swap 1.6 SUI to USDC",
          params: {
            amount: { kind: "literal", value: 1.6 },
            side: "sell",
            input_coin: "SUI",
            output_coin: "USDC",
            pool_key: "SUI_USDC",
          },
        },
        {
          action: "deepbook_deposit",
          label: "Deposit output",
          params: {
            amount_display: { kind: "ref", step_index: 0, field: "output_amount" },
            coin_key: { kind: "ref", step_index: 0, field: "output_coin" },
          },
        },
      ],
    };

    const result = await validatePlannerOutput(planner, "swap then deposit it");
    assert.equal(result.status, "clarify");
    if (result.status === "clarify") {
      const swapStep = result.plan.steps[0];
      assert.equal(swapStep.kind, "execute");
      if (swapStep.kind === "execute") {
        assert.equal(swapStep.input.params.amount, 1.6);
      }
    }
  });
});
