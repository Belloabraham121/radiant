import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlashLoanProceedNudge,
  extractPoolKeysFromText,
  formatFlashLoanQuoteReply,
  shouldFinalizeFlashLoanQuoteReply,
  shouldNudgeFlashLoanMissingAmount,
  shouldNudgeFlashLoanProceed,
  summarizeFlashLoanUserRequest,
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

  it("summarizeFlashLoanUserRequest captures user wording without prescribing strategy", () => {
    const intent = {
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      asset: "quote" as const,
      coin_key: "USDC",
    };
    const summary = summarizeFlashLoanUserRequest(
      "10000 USDC",
      [{ role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" }],
      intent,
    );
    assert.match(summary, /flash loan between SUI_USDC and DEEP_USDC/);
    assert.match(summary, /10000 USDC/);
    assert.match(summary, /SUI_USDC/);
    assert.match(summary, /DEEP_USDC/);
    assert.doesNotMatch(summary, /swap_chain_repay|round_trip/);
  });

  it("shouldNudgeFlashLoanProceed when amount is known (any route shape)", () => {
    assert.equal(
      shouldNudgeFlashLoanProceed(
        [],
        "10000 USDC",
        [
          { role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" },
          { role: "user", content: "10000 USDC" },
        ],
      ),
      true,
    );
    assert.equal(
      shouldNudgeFlashLoanProceed(
        [],
        "flash loan 1 SUI on SUI_USDC round trip",
        [],
      ),
      true,
    );
  });

  it("buildFlashLoanProceedNudge lets the agent choose strategy", () => {
    const nudge = buildFlashLoanProceedNudge(
      {
        pool_key: "SUI_USDC",
        borrow_amount: 10000,
        asset: "quote",
        coin_key: "USDC",
      },
      "10000 USDC",
      [{ role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" }],
    );
    assert.match(nudge, /You choose the strategy/i);
    assert.match(nudge, /round_trip/);
    assert.match(nudge, /swap_chain_repay/);
    assert.doesNotMatch(nudge, /strategy: "swap_chain_repay"/);
    assert.doesNotMatch(nudge, /strategy: "round_trip"/);
  });

  it("shouldNudgeFlashLoanProceed is false after approval_required", () => {
    assert.equal(
      shouldNudgeFlashLoanProceed(
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
