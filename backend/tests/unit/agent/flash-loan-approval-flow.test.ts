import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlashLoanExecuteNudge,
  buildFlashLoanQuoteNudge,
  extractPoolKeysFromText,
  formatFlashLoanQuoteReply,
  inferInitialSwapStep,
  shouldFinalizeFlashLoanQuoteReply,
  shouldNudgeFlashLoanExecute,
  shouldNudgeFlashLoanMissingAmount,
  shouldNudgeFlashLoanQuote,
  userRequestedMultiPoolFlashLoan,
} from "../../../src/services/agent/flash-loan-approval-flow.js";

describe("flash-loan-approval-flow", () => {
  it("detects multi-pool flash loan requests", () => {
    assert.equal(
      userRequestedMultiPoolFlashLoan("flash loan between SUI_USDC and DEEP_USDC"),
      true,
    );
    assert.deepEqual(
      extractPoolKeysFromText("SUI/USDC and DEEP/USDC pools"),
      ["SUI_USDC", "DEEP_USDC"],
    );
  });

  it("infers USDC borrow hop on DEEP_USDC", () => {
    const intent = {
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      asset: "quote" as const,
      coin_key: "USDC",
    };
    const step = inferInitialSwapStep(
      intent,
      "flash loan between SUI_USDC and DEEP_USDC with 10000 USDC",
      [],
    );
    assert.deepEqual(step, { pool_key: "DEEP_USDC", side: "buy", amount: 10000 });
  });

  it("shouldNudgeFlashLoanQuote for multi-pool amount request", () => {
    assert.equal(
      shouldNudgeFlashLoanQuote(
        [],
        "10000 USDC",
        [
          { role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" },
          { role: "user", content: "10000 USDC" },
        ],
      ),
      true,
    );
  });

  it("buildFlashLoanQuoteNudge includes swap_chain_repay params", () => {
    const nudge = buildFlashLoanQuoteNudge(
      {
        pool_key: "SUI_USDC",
        borrow_amount: 10000,
        asset: "quote",
        coin_key: "USDC",
      },
      "10000 USDC",
      [{ role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" }],
    );
    assert.match(nudge, /flash_loan_quote/);
    assert.match(nudge, /swap_chain_repay/);
    assert.match(nudge, /DEEP_USDC/);
  });

  it("buildFlashLoanExecuteNudge uses round_trip for single pool", () => {
    const nudge = buildFlashLoanExecuteNudge({
      pool_key: "SUI_USDC",
      borrow_amount: 1,
      asset: "base",
      coin_key: "SUI",
    });
    assert.match(nudge, /round_trip/);
    assert.match(nudge, /do not ask me to confirm/i);
  });

  it("shouldNudgeFlashLoanExecute is false for multi-pool route before quote", () => {
    assert.equal(
      shouldNudgeFlashLoanExecute(
        [],
        "10000 USDC",
        [{ role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" }],
      ),
      false,
    );
  });

  it("shouldNudgeFlashLoanExecute is false after approval_required", () => {
    assert.equal(
      shouldNudgeFlashLoanExecute(
        [
          {
            name: "execute_transaction",
            result: {
              status: "approval_required",
              pending: { action: "deepbook_flash_loan", amount_display: "10000 USDC" },
            },
          },
        ],
        "yes",
        [{ role: "user", content: "10000 USDC" }],
      ),
      false,
    );
  });

  it("shouldNudgeFlashLoanMissingAmount before amount is known", () => {
    assert.equal(
      shouldNudgeFlashLoanMissingAmount(
        [],
        "flash loan between SUI_USDC and DEEP_USDC",
        [{ role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" }],
      ),
      true,
    );
  });

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
