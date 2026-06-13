import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePlannerAssumption,
  normalizePlannerAssumptions,
} from "../../../src/services/agent/workflow/planner-assumptions.js";
import { collectClarificationGaps } from "../../../src/services/agent/workflow/workflow-clarification-gaps.js";
import { validatePlannerOutput } from "../../../src/services/agent/workflow/workflow-plan-validator.js";
import type { PlannerOutput } from "../../../src/services/agent/workflow/planner.types.js";
import type { WorkflowPlan } from "../../../src/services/agent/workflow/workflow.types.js";

describe("planner assumptions", () => {
  it("drops malformed assumption entries", () => {
    const normalized = normalizePlannerAssumptions([
      { field: "action" },
      { interpreted: "buy", from_phrase: "order to buy" },
      { interpretation: "deposit", original_text: "depost" },
    ]);

    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].interpreted, "buy");
    assert.equal(normalized[1].interpreted, "deposit");
    assert.equal(normalized[1].from_phrase, "depost");
  });

  it("returns null for empty assumption objects", () => {
    assert.equal(normalizePlannerAssumption({}), null);
    assert.equal(normalizePlannerAssumption({ field: "price" }), null);
  });
});

describe("clarification gap priority", () => {
  const plan: WorkflowPlan = {
    originalMessage: "deposit then buy",
    steps: [
      {
        kind: "execute",
        label: "Deposit 1.2 SUI",
        input: {
          chain_id: "sui",
          action: "deepbook_deposit",
          params: { coin_key: "SUI", amount_display: 1.2 },
        },
      },
      {
        kind: "execute",
        label: "Limit buy 1.1 SUI",
        input: {
          chain_id: "sui",
          action: "deepbook_place_limit_order",
          params: {
            pool_key: "SUI_USDC",
            quantity: 1.1,
            side: "buy",
          },
        },
      },
    ],
  };

  it("prioritizes missing price input over malformed assumptions", () => {
    const gaps = collectClarificationGaps(plan, {
      confidence: 0.6,
      assumptions: [{ field: "price" } as PlannerOutput["assumptions"][number]],
    });

    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].interaction_type, "input");
    assert.equal(gaps[0].field, "price");
  });

  it("validator ignores malformed LLM assumptions for deposit+buy without price", async () => {
    const planner: PlannerOutput = {
      is_multi_step: true,
      confidence: 0.72,
      needs_clarification: true,
      assumptions: [{ field: "side" } as PlannerOutput["assumptions"][number]],
      steps: [
        {
          action: "deepbook_deposit",
          label: "Deposit SUI into Deepbook Balance Manager",
          params: { coin_key: "SUI", amount_display: 1.2 },
        },
        {
          action: "deepbook_place_limit_order",
          label: "Place Limit Order to Buy SUI",
          params: {
            pool_key: "SUI_USDC",
            quantity: 1.1,
            side: "buy",
          },
        },
      ],
    };

    const result = await validatePlannerOutput(
      planner,
      "deposit 1.2 sui and order to buy 1.1 SUI at USDC on sui/usdc",
    );

    assert.equal(result.status, "clarify");
    if (result.status === "clarify") {
      assert.equal(result.gap.interaction_type, "input");
      assert.equal(result.gap.field, "price");
      assert.doesNotMatch(result.gap.question, /undefined/i);
    }
  });

  it("validator corrects LLM pool key mistaken for deposit coin_key", async () => {
    const planner: PlannerOutput = {
      is_multi_step: true,
      confidence: 0.95,
      needs_clarification: false,
      assumptions: [],
      steps: [
        {
          action: "deepbook_deposit",
          label: "Deposit SUI into Deepbook Balance Manager",
          params: { coin_key: "WAL_USDC", amount_display: 1.2 },
        },
        {
          action: "deepbook_place_limit_order",
          label: "Place Limit Order to Buy SUI",
          params: {
            pool_key: "SUI_USDC",
            quantity: 1.1,
            price: 1.11,
            side: "buy",
          },
        },
      ],
    };

    const result = await validatePlannerOutput(
      planner,
      "deposit 1.2 sui into my deepbook balance manager and order to buy 1.1 SUI at USDC on sui/usdc",
    );

    assert.equal(result.status, "ready");
    if (result.status === "ready") {
      const deposit = result.plan.steps[0];
      assert.equal(deposit.kind, "execute");
      if (deposit.kind === "execute") {
        assert.equal(deposit.input.action, "deepbook_deposit");
        assert.equal(deposit.input.params.coin_key, "SUI");
        assert.equal(deposit.input.params.amount_display, 1.2);
      }
    }
  });
});
