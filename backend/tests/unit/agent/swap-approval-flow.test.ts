import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findLatestSwapQuote,
  shouldNudgeSwapExecute,
} from "../../../src/services/agent/swap-approval-flow.js";

describe("swap-approval-flow", () => {
  it("shouldNudgeSwapExecute when quote exists without execute", () => {
    const toolCalls = [
      {
        name: "query_chain",
        result: {
          input_amount_display: 1.6,
          output_amount_display: 1.12,
          input_coin: "SUI",
          output_coin: "USDC",
        },
      },
    ];
    assert.equal(shouldNudgeSwapExecute(toolCalls, "swap 1.6 SUI to USDC"), true);
  });

  it("should not nudge after execute_transaction was attempted", () => {
    const toolCalls = [
      {
        name: "query_chain",
        result: { input_amount_display: 1.6, output_amount_display: 1.12 },
      },
      {
        name: "execute_transaction",
        result: { status: "approval_required", pending: { id: "x" } },
      },
    ];
    assert.equal(shouldNudgeSwapExecute(toolCalls, "swap 1.6 SUI to USDC"), false);
  });

  it("findLatestSwapQuote returns the most recent quote", () => {
    const quote = findLatestSwapQuote([
      { name: "query_chain", result: { input_amount_display: 1, output_amount_display: 0.7 } },
      { name: "query_chain", result: { error: { code: "X", message: "fail" } } },
      { name: "query_chain", result: { input_amount_display: 1.6, output_amount_display: 1.1 } },
    ]);
    assert.equal(quote?.input_amount_display, 1.6);
  });
});
