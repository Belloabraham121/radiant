import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterToolCallsForClientDisplay,
  formatFlashLoanQuoteReply,
  isInfeasibleFlashLoanQuoteResult,
  shouldFinalizeFlashLoanQuoteReply,
} from "../../../src/services/agent/deepbook/flash-loan-approval-flow.js";

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
  estimated_surplus: -20.6,
  requires_manual_approval: false,
  steps: [
    {
      pool_key: "SUI_USDC",
      side: "buy" as const,
      in_amount: 10000,
      out_est: 13037.7,
      min_out: 9979.39,
      fee_deep: 0,
      input_coin: "USDC",
      output_coin: "SUI",
    },
    {
      pool_key: "SUI_USDC",
      side: "sell" as const,
      in_amount: 13037.7,
      out_est: 9979.39,
      min_out: 9879.39,
      fee_deep: 0,
      input_coin: "SUI",
      output_coin: "USDC",
    },
  ],
  warnings: ["Quoted outputs may not cover the borrow amount for atomic repay."],
};

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

  it("isInfeasibleFlashLoanQuoteResult detects infeasible quotes", () => {
    assert.equal(isInfeasibleFlashLoanQuoteResult(infeasibleQuote), true);
    assert.equal(
      isInfeasibleFlashLoanQuoteResult({ ...infeasibleQuote, repay_feasible: true }),
      false,
    );
  });

  it("filterToolCallsForClientDisplay drops failed queries after infeasible quote", () => {
    const toolCalls = [
      { name: "query_chain", result: infeasibleQuote },
      {
        name: "execute_transaction",
        result: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Flash loan repay is not feasible at quoted outputs",
          },
        },
      },
      {
        name: "query_chain",
        result: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Final swap must output USDC to repay the loan, but outputs USDT",
          },
        },
      },
      {
        name: "query_chain",
        result: {
          error: { code: "VALIDATION_ERROR", message: "Another failed query" },
        },
      },
    ];

    const filtered = filterToolCallsForClientDisplay(toolCalls);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0]?.name, "query_chain");
    assert.equal(filtered[1]?.name, "execute_transaction");
  });

  it("filterToolCallsForClientDisplay keeps all calls when quote is feasible", () => {
    const feasible = { ...infeasibleQuote, repay_feasible: true };
    const toolCalls = [
      { name: "query_chain", result: feasible },
      {
        name: "query_chain",
        result: { error: { code: "VALIDATION_ERROR", message: "still visible" } },
      },
    ];
    assert.equal(filterToolCallsForClientDisplay(toolCalls).length, 2);
  });

  it("filterToolCallsForClientDisplay dedupes validation failures", () => {
    const toolCalls = [
      {
        name: "query_chain",
        result: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Step 2 must spend SUI from step 1, but spends USDT",
          },
        },
      },
      {
        name: "query_chain",
        result: {
          error: { code: "VALIDATION_ERROR", message: "Another failed query" },
        },
      },
    ];
    assert.equal(filterToolCallsForClientDisplay(toolCalls).length, 1);
  });

  it("filterToolCallsForClientDisplay drops unrelated swap_quote during flash loan errors", () => {
    const toolCalls = [
      {
        name: "query_chain",
        result: {
          error: {
            code: "VALIDATION_ERROR",
            message: 'params.steps is required for strategy "swap_chain_repay" (1–2 steps)',
          },
        },
      },
      {
        name: "query_chain",
        result: {
          input_coin: "SUI",
          output_coin: "USDC",
          input_amount_display: 10000,
          output_amount_display: 7681.64,
          pool_key: "SUI_USDC",
        },
      },
      {
        name: "execute_transaction",
        result: {
          error: {
            code: "VALIDATION_ERROR",
            message: "steps[0].amount must be a positive number",
          },
        },
      },
    ];

    const filtered = filterToolCallsForClientDisplay(toolCalls);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0]?.name, "query_chain");
    assert.equal(filtered[1]?.name, "execute_transaction");
  });
});
