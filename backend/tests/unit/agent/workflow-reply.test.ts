import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { synthesizeWorkflowCompletionReply } from "../../../src/services/agent/workflow/workflow-reply.js";
import type { CompletedWorkflowStep } from "../../../src/services/agent/workflow/workflow.types.js";

describe("workflow-reply", () => {
  it("includes wallet balances from a query step", () => {
    const completed: CompletedWorkflowStep[] = [
      {
        index: 0,
        label: "Swap 20 DEEP to USDC",
        tool_calls: [
          {
            name: "execute_transaction",
            result: { status: "executed", result: { digest: "0xabc" } },
          },
        ],
        digest: "0xabc",
        status: "executed",
      },
      {
        index: 1,
        label: "Wallet token balances",
        tool_calls: [
          {
            name: "query_chain",
            result: {
              chain_id: "sui",
              address: "0x1",
              assets: [
                {
                  symbol: "USDC",
                  balance_display: 42.5,
                  balance_atomic: "42500000",
                  usd_value: 42.5,
                },
              ],
              total_usd: 42.5,
              catalog_source: "indexer",
              updated_at: new Date().toISOString(),
            },
          },
        ],
        status: "executed",
      },
    ];

    const reply = synthesizeWorkflowCompletionReply(completed, []);
    assert.match(reply, /Completed 2 step/);
    assert.match(reply, /42\.5 USDC/);
    assert.match(reply, /Wallet balances/);
  });

  it("reports skipped steps with reasons", () => {
    const reply = synthesizeWorkflowCompletionReply(
      [
        {
          index: 0,
          label: "Swap",
          tool_calls: [],
          status: "executed",
        },
      ],
      [{ index: 1, label: "Show balance", reason: "Skipped because step 1 did not succeed." }],
    );
    assert.match(reply, /Skipped 1 step/);
    assert.match(reply, /Show balance/);
  });
});
