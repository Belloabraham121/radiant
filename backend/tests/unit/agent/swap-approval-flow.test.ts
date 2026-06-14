import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findLatestSwapQuote,
  shouldNudgeSwapExecute,
  shouldNudgeSwapQuoteAndExecute,
} from "../../../src/services/agent/deepbook/swap-approval-flow.js";
import { messageHasExecutableSwapIntent } from "../../../src/services/agent/workflow/workflow-parser.js";

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

  it("shouldNudgeSwapQuoteAndExecute when swap requested without quote or execute", () => {
    assert.equal(shouldNudgeSwapQuoteAndExecute([], "swap 10 DEEP to SUI"), true);
    assert.equal(
      shouldNudgeSwapQuoteAndExecute(
        [{ name: "query_chain", result: { input_amount_display: 10, output_amount_display: 1.2 } }],
        "swap 10 DEEP to SUI",
      ),
      false,
    );
  });

  it("should not nudge for build-a-swap UI requests without trade params", () => {
    assert.equal(
      shouldNudgeSwapQuoteAndExecute([], "build a swap like uniswap with different components"),
      false,
    );
    assert.equal(
      shouldNudgeSwapExecute(
        [{ name: "query_chain", result: { input_amount_display: 1, output_amount_display: 0.7 } }],
        "create a swap app similar to Uniswap",
      ),
      false,
    );
  });

  it("messageHasExecutableSwapIntent distinguishes UI vs trade", () => {
    assert.equal(messageHasExecutableSwapIntent("build swap like uniswap"), false);
    assert.equal(messageHasExecutableSwapIntent("swap 10 SUI to USDC"), true);
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
