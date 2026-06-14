import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePlannerOutput } from "../../../src/services/agent/workflow/workflow-plan-validator.js";
import type { PlannerOutput } from "../../../src/services/agent/workflow/planner.types.js";

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("workflow app_action planning", () => {
  it("maps planned steps with project_id to app_action workflow steps", async () => {
    const planner: PlannerOutput = {
      is_multi_step: true,
      confidence: 0.95,
      needs_clarification: false,
      assumptions: [],
      steps: [
        {
          action: "swap",
          label: "Swap 2 SUI to USDC",
          project_id: PROJECT_ID,
          params: {
            pool_key: "SUI_USDC",
            amount: 2,
            side: "sell",
          },
        },
        {
          action: "query",
          label: "Wallet balances",
          params: { query: "token_balances" },
        },
      ],
    };

    const result = await validatePlannerOutput(
      planner,
      "swap 2 SUI in my DEX project, then show my wallet balance",
    );

    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }

    assert.equal(result.plan.steps[0]?.kind, "app_action");
    if (result.plan.steps[0]?.kind === "app_action") {
      assert.equal(result.plan.steps[0].project_id, PROJECT_ID);
      assert.equal(result.plan.steps[0].action, "swap");
      assert.equal(result.plan.steps[0].params.amount, 2);
    }
    assert.equal(result.plan.steps[1]?.kind, "query");
  });

  it("keeps execute steps when no project scope is provided", async () => {
    const planner: PlannerOutput = {
      is_multi_step: true,
      confidence: 0.95,
      needs_clarification: false,
      assumptions: [],
      steps: [
        {
          action: "swap",
          label: "Swap 2 SUI",
          params: { amount: 2, side: "sell", pool_key: "SUI_USDC" },
        },
        {
          action: "query",
          label: "Wallet balances",
          params: { query: "token_balances" },
        },
      ],
    };

    const result = await validatePlannerOutput(planner, "swap 2 SUI, then show balance");
    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }
    assert.equal(result.plan.steps[0]?.kind, "execute");
  });
});
