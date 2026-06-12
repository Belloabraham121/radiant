import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  looksLikeWorkflowMessage,
  planWorkflowHeuristic,
} from "../../../src/services/agent/workflow/heuristic-planner.js";
import { clearAllClarificationsForTests } from "../../../src/services/agent/workflow/clarification.store.js";
import { setPlannerHandlerForTests } from "../../../src/services/agent/workflow/workflow-planner.js";
import { validatePlannerOutput } from "../../../src/services/agent/workflow/workflow-plan-validator.js";
import { clearAllSessionWorkflowsForTests } from "../../../src/services/agent/workflow/session-workflow.store.js";
import { clearPendingTransactionsForTests } from "../../../src/services/agent/transaction-approval.service.js";
import { setAgentToolHandlerForTests } from "../../../src/services/agent/tools.js";
import {
  continueWorkflowAfterClarification,
  tryStartWorkflowFromMessage,
} from "../../../src/services/agent/workflow/workflow-coordinator.js";
import type { PlannerOutput } from "../../../src/services/agent/workflow/planner.types.js";

const SESSION = "00000000-0000-4000-8000-000000000101";

describe("workflow planner system", () => {
  afterEach(() => {
    clearAllClarificationsForTests();
    clearAllSessionWorkflowsForTests();
    clearPendingTransactionsForTests();
    setAgentToolHandlerForTests(null);
    setPlannerHandlerForTests(null);
  });

  it("detects comma-separated multi-step messages", () => {
    const message = "swap 1.6 SUI to USDC, swap 1.6 USDC to SUI, deposit it into deepbook";
    assert.equal(looksLikeWorkflowMessage(message), true);
  });

  it("heuristic planner maps with all typo to withdraw", async () => {
    const message = "with all SUI from deepbook, then swap 1.6 SUI to USDC";
    const plan = planWorkflowHeuristic(message);
    assert.ok(plan);
    assert.equal(plan!.steps.length, 2);
    assert.equal(plan!.steps[0].action, "deepbook_withdraw");
    assert.equal(plan!.needs_clarification, true);
  });

  it("validator requests clarification for low confidence assumptions", async () => {
    const planner: PlannerOutput = {
      is_multi_step: true,
      confidence: 0.75,
      needs_clarification: false,
      assumptions: [
        { field: "action", interpreted: "withdraw all SUI", from_phrase: "with all" },
      ],
      steps: [
        {
          action: "deepbook_withdraw",
          label: "Withdraw all SUI",
          params: { coin_key: "SUI", withdraw_all: true },
        },
        {
          action: "swap",
          label: "Swap 1.6 SUI",
          params: {
            pool_key: "SUI_USDC",
            amount: 1.6,
            side: "sell",
            input_coin: "SUI",
            output_coin: "USDC",
          },
        },
      ],
    };

    const result = await validatePlannerOutput(planner, "with all SUI then swap");
    assert.equal(result.status, "clarify");
    if (result.status === "clarify") {
      assert.match(result.question, /withdraw all SUI/i);
    }
  });

  it("starts workflow when planner output is ready", async () => {
    setPlannerHandlerForTests(async () => ({
      is_multi_step: true,
      confidence: 0.95,
      needs_clarification: false,
      assumptions: [],
      steps: [
        {
          action: "deepbook_deposit",
          label: "Deposit 1 SUI",
          params: { coin_key: "SUI", amount_display: 1 },
        },
        {
          action: "swap",
          label: "Swap 1 SUI",
          params: {
            pool_key: "SUI_USDC",
            amount: 1,
            side: "sell",
            input_coin: "SUI",
            output_coin: "USDC",
          },
        },
      ],
    }));

    let executeCount = 0;
    setAgentToolHandlerForTests(async (_privyUserId, name) => {
      if (name !== "execute_transaction") {
        return { error: { code: "X", message: "unexpected" } };
      }
      executeCount += 1;
      return {
        status: "approval_required",
        pending: {
          id: "11111111-1111-4111-8111-111111111111",
          chain_id: "sui",
          action: "deepbook_deposit",
          params: { coin_key: "SUI", amount_display: 1 },
          summary: "Deposit",
          amount_display: "1 SUI",
        },
      };
    });

    const outcome = await tryStartWorkflowFromMessage(
      "privy-planner",
      SESSION,
      "deposit 1 SUI, then swap 1 SUI to USDC",
    );

    assert.ok(outcome);
    assert.ok(outcome!.pending_transaction);
    assert.equal(executeCount, 1);
  });

  it("continues workflow after clarification yes", async () => {
    setPlannerHandlerForTests(async () => ({
      is_multi_step: true,
      confidence: 0.75,
      needs_clarification: true,
      assumptions: [
        { field: "action", interpreted: "withdraw all SUI", from_phrase: "with all" },
      ],
      clarification: {
        question: "Did you mean withdraw all SUI?",
        kind: "intent",
        step_index: 0,
      },
      steps: [
        {
          action: "deepbook_withdraw",
          label: "Withdraw all SUI",
          params: { coin_key: "SUI", withdraw_all: true },
        },
        {
          action: "swap",
          label: "Swap 1.6 SUI",
          params: {
            pool_key: "SUI_USDC",
            amount: 1.6,
            side: "sell",
            input_coin: "SUI",
            output_coin: "USDC",
          },
        },
      ],
    }));

    const first = await tryStartWorkflowFromMessage(
      "privy-planner",
      SESSION,
      "with all SUI, swap 1.6 to USDC",
    );
    assert.ok(first?.pending_clarification);

    setAgentToolHandlerForTests(async () => ({
      status: "executed",
      result: {
        chain_id: "sui",
        digest: "digest-1",
        address: "0xabc",
        effects_status: "success",
      },
    }));

    const continued = await continueWorkflowAfterClarification(
      "privy-planner",
      SESSION,
      first!.pending_clarification!.id,
      "yes",
    );

    assert.ok(continued);
    assert.equal(continued!.workflowCompleted, true);
  });

  it("skips step on clarification no", async () => {
    setPlannerHandlerForTests(async () => ({
      is_multi_step: true,
      confidence: 0.75,
      needs_clarification: true,
      assumptions: [],
      clarification: {
        question: "Skip order step?",
        kind: "constraint_skip",
        step_index: 1,
      },
      steps: [
        {
          action: "deepbook_deposit",
          label: "Deposit 1 SUI",
          params: { coin_key: "SUI", amount_display: 1 },
        },
        {
          action: "deepbook_place_limit_order",
          label: "Limit buy 0.1 SUI",
          params: {
            pool_key: "SUI_USDC",
            quantity: 0.1,
            price: 2,
            side: "buy",
          },
        },
      ],
    }));

    const first = await tryStartWorkflowFromMessage(
      "privy-planner",
      SESSION,
      "deposit 1 SUI, buy 0.1 SUI at 2 USDC",
    );
    assert.ok(first?.pending_clarification);

    const continued = await continueWorkflowAfterClarification(
      "privy-planner",
      SESSION,
      first!.pending_clarification!.id,
      "no",
    );

    assert.ok(continued);
    assert.match(continued!.reply, /not enough steps|won't run/i);
  });
});
