import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlashLoanQuoteFailureMessage,
  buildFlashLoanQuoteLedgerDisplay,
  flashLoanQuoteToExecuteParams,
} from "../../../src/services/agent-transaction/record-flash-loan-quote.js";

const infeasibleQuote = {
  strategy: "swap_chain_repay" as const,
  pool_key: "SUI_USDC",
  borrow_amount: 10000,
  asset: "quote" as const,
  coin_key: "USDC",
  repay_asset: "USDC",
  repay_amount: 10000,
  repay_feasible: false,
  repay_source: "swap_output" as const,
  estimated_surplus: -20.49459,
  requires_manual_approval: false,
  steps: [
    {
      pool_key: "SUI_USDC",
      side: "buy" as const,
      in_amount: 10000,
      out_est: 13004.9,
      min_out: 9979.39,
      fee_deep: 0,
      input_coin: "USDC",
      output_coin: "SUI",
    },
    {
      pool_key: "SUI_USDC",
      side: "sell" as const,
      in_amount: 13004.9,
      out_est: 9979.50541,
      min_out: 9879.7103559,
      fee_deep: 0,
      input_coin: "SUI",
      output_coin: "USDC",
    },
  ],
  warnings: ["Quoted outputs may not cover the borrow amount for atomic repay."],
};

describe("record-flash-loan-quote", () => {
  it("buildFlashLoanQuoteLedgerDisplay includes route and shortfall", () => {
    const display = buildFlashLoanQuoteLedgerDisplay(infeasibleQuote);
    assert.match(display.title, /Flash loan bundle blocked/);
    assert.match(display.amount_display, /Borrow 10,000 USDC/);
    assert.match(display.amount_display, /shortfall ~20\.49459 USDC/);
  });

  it("buildFlashLoanQuoteFailureMessage explains repay shortfall", () => {
    const message = buildFlashLoanQuoteFailureMessage(infeasibleQuote);
    assert.match(message, /shortfall ~20\.49459 USDC/);
  });

  it("flashLoanQuoteToExecuteParams maps quoted steps for ledger params", () => {
    const params = flashLoanQuoteToExecuteParams(infeasibleQuote);
    assert.equal(params.strategy, "swap_chain_repay");
    assert.equal((params.steps as Array<{ amount: number }>)[0]?.amount, 10000);
  });
});
