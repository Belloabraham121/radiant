import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearPendingTransactionsForTests } from "../../../src/services/agent/transaction-approval.service.js";
import { setAgentToolHandlerForTests } from "../../../src/services/agent/tools.js";
import { clearAllSessionWorkflowsForTests } from "../../../src/services/agent/workflow/session-workflow.store.js";
import {
  continueWorkflowAfterApproval,
  startAndRunWorkflow,
} from "../../../src/services/agent/workflow/workflow-runner.js";
import type { WorkflowPlan } from "../../../src/services/agent/workflow/workflow.types.js";

const SESSION = "00000000-0000-4000-8000-000000000099";

describe("workflow-runner", () => {
  afterEach(() => {
    clearAllSessionWorkflowsForTests();
    clearPendingTransactionsForTests();
    setAgentToolHandlerForTests(null);
  });

  it("pauses on first approval and continues after approve", async () => {
    let executeCount = 0;

    setAgentToolHandlerForTests(async (_privyUserId, name) => {
      if (name !== "execute_transaction") {
        return { error: { code: "X", message: "unexpected" } };
      }
      executeCount += 1;
      if (executeCount === 1) {
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
      }
      return {
        status: "executed",
        result: {
          chain_id: "sui",
          digest: "digest-step-2",
          address: "0xabc",
          effects_status: "success",
        },
      };
    });

    const plan: WorkflowPlan = {
      originalMessage: "deposit then order",
      steps: [
        {
          kind: "execute",
          label: "Deposit 1 SUI",
          input: {
            chain_id: "sui",
            action: "deepbook_deposit",
            params: { coin_key: "SUI", amount_display: 1 },
          },
        },
        {
          kind: "execute",
          label: "Limit buy",
          input: {
            chain_id: "sui",
            action: "deepbook_place_limit_order",
            params: { pool_key: "SUI_USDC", quantity: 0.1, price: 2, side: "buy" },
          },
        },
      ],
    };

    const first = await startAndRunWorkflow("privy-workflow", SESSION, plan);
    assert.ok(first.pending_transaction);
    assert.match(first.reply, /Step 1 of 2/i);
    assert.equal(first.workflowCompleted, false);
    assert.equal(first.pending_clarification, null);

    const continued = await continueWorkflowAfterApproval(
      "privy-workflow",
      SESSION,
      {
        chain_id: "sui",
        digest: "digest-step-1",
        address: "0xabc",
        effects_status: "success",
      },
      first.pending_transaction!.id,
    );

    assert.ok(continued);
    assert.equal(continued!.workflowCompleted, true);
    assert.match(continued!.reply, /digest-step-1/i);
    assert.equal(executeCount, 2);
  });

  it("returns next pending_transaction when step 2 also needs approval", async () => {
    let executeCount = 0;

    setAgentToolHandlerForTests(async (_privyUserId, name) => {
      if (name !== "execute_transaction") {
        return { error: { code: "X", message: "unexpected" } };
      }
      executeCount += 1;
      if (executeCount === 1) {
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
      }
      return {
        status: "approval_required",
        pending: {
          id: "22222222-2222-4222-8222-222222222222",
          chain_id: "sui",
          action: "deepbook_place_limit_order",
          params: { pool_key: "SUI_USDC", quantity: 0.1, price: 2, side: "buy" },
          summary: "Limit buy",
          amount_display: "0.1 SUI",
        },
      };
    });

    const plan: WorkflowPlan = {
      originalMessage: "deposit then order",
      steps: [
        {
          kind: "execute",
          label: "Deposit 1 SUI",
          input: {
            chain_id: "sui",
            action: "deepbook_deposit",
            params: { coin_key: "SUI", amount_display: 1 },
          },
        },
        {
          kind: "execute",
          label: "Limit buy",
          input: {
            chain_id: "sui",
            action: "deepbook_place_limit_order",
            params: { pool_key: "SUI_USDC", quantity: 0.1, price: 2, side: "buy" },
          },
        },
      ],
    };

    const first = await startAndRunWorkflow("privy-workflow", SESSION, plan);
    const continued = await continueWorkflowAfterApproval(
      "privy-workflow",
      SESSION,
      {
        chain_id: "sui",
        digest: "digest-step-1",
        address: "0xabc",
        effects_status: "success",
      },
      first.pending_transaction!.id,
    );

    assert.ok(continued);
    assert.equal(continued!.workflowCompleted, false);
    assert.ok(continued!.pending_transaction);
    assert.equal(continued!.pending_transaction!.id, "22222222-2222-4222-8222-222222222222");
    assert.match(continued!.reply, /Step 2 of 2/i);
    assert.equal(executeCount, 2);
  });
});
