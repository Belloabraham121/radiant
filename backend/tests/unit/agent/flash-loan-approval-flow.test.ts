import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFlashLoanQuoteReply,
  shouldFinalizeFlashLoanQuoteReply,
} from "../../../src/services/agent/deepbook/flash-loan-approval-flow.js";

describe("flash-loan-approval-flow", () => {
  it("formatFlashLoanQuoteReply explains infeasible repay", () => {
    const reply = formatFlashLoanQuoteReply({
      strategy: "swap_chain_repay",
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      asset: "quote",
      coin_key: "USDC",
      repay_asset: "USDC",
      repay_amount: 10000,
      repay_feasible: false,
      repay_source: "swap_output",
      estimated_surplus: null,
      requires_manual_approval: false,
      steps: [
        {
          pool_key: "DEEP_USDC",
          side: "buy",
          in_amount: 10000,
          out_est: 8000,
          min_out: 7900,
          fee_deep: 0,
          input_coin: "USDC",
          output_coin: "DEEP",
        },
      ],
      warnings: ["Quoted outputs may not cover the borrow amount for atomic repay."],
    });

    assert.match(reply, /Repay feasible at quoted mins: no/);
    assert.match(reply, /can't execute this bundle/i);
  });

  it("shouldFinalizeFlashLoanQuoteReply when repay is not feasible", () => {
    const quote = {
      strategy: "swap_chain_repay" as const,
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      asset: "quote" as const,
      coin_key: "USDC",
      repay_asset: "USDC",
      repay_amount: 10000,
      repay_feasible: false,
      repay_source: "swap_output" as const,
      estimated_surplus: null,
      requires_manual_approval: false,
      steps: [],
      warnings: [],
    };

    assert.ok(
      shouldFinalizeFlashLoanQuoteReply(
        [{ name: "query_chain", result: quote }],
        false,
      ),
    );
  });
});
