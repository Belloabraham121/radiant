import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlashLoanProceedNudge,
  extractFlashLoanIntentFromThread,
  extractPoolKeysFromText,
  findLastAssistantStrategyProposal,
  formatFlashLoanQuoteReply,
  shouldFinalizeFlashLoanQuoteReply,
  shouldNudgeFlashLoanMissingAmount,
  shouldNudgeFlashLoanProceed,
  shouldNudgeFlashLoanToolRetry,
  threadHasBorrowAmount,
  userRequestedMultiPoolFlashLoan,
} from "../../../src/services/agent/flash-loan-approval-flow.js";

const assistantProposal = `Here are pools for flash loans:
Arbitrage Strategy:
1. SUI_USDC to DEEP_USDC
2. USDT_USDC to SUI_USDC: Swap USDT for USDC, borrow SUI, sell SUI back to USDC.
Suggested Amounts: Flash loan 10,000 USDC in the SUI_USDC pool.`;

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

  it("extractFlashLoanIntentFromThread reads amounts from assistant proposals", () => {
    const intent = extractFlashLoanIntentFromThread([
      { role: "user", content: "trigger a flash loan and suggest strategies" },
      { role: "assistant", content: assistantProposal },
      { role: "user", content: "use the second strategy, kindly execute it" },
    ]);
    assert.ok(intent);
    assert.equal(intent?.borrow_amount, 10000);
    assert.equal(intent?.coin_key, "USDC");
    assert.equal(intent?.pool_key, "SUI_USDC");
  });

  it("shouldNudgeFlashLoanProceed when user asks to execute a prior strategy", () => {
    const history = [
      { role: "user" as const, content: "trigger a flash loan and suggest strategies" },
      { role: "assistant" as const, content: assistantProposal },
    ];
    assert.equal(
      shouldNudgeFlashLoanProceed(
        [],
        "use the second strategy, kindly execute it",
        history,
      ),
      true,
    );
    assert.equal(threadHasBorrowAmount(history, "use the second strategy"), true);
  });

  it("buildFlashLoanProceedNudge includes prior assistant proposal", () => {
    const nudge = buildFlashLoanProceedNudge(
      "use the second strategy, execute it",
      [
        { role: "user", content: "trigger a flash loan" },
        { role: "assistant", content: assistantProposal },
      ],
      {
        pool_key: "SUI_USDC",
        borrow_amount: 10000,
        asset: "quote",
        coin_key: "USDC",
      },
    );
    assert.match(nudge, /second strategy/i);
    assert.match(nudge, /Your prior proposal/i);
    assert.match(nudge, /USDT_USDC to SUI_USDC/);
    assert.doesNotMatch(nudge, /strategy: "swap_chain_repay"/);
  });

  it("shouldNudgeFlashLoanMissingAmount only when thread has no amount", () => {
    assert.equal(
      shouldNudgeFlashLoanMissingAmount(
        [],
        "flash loan between SUI_USDC and DEEP_USDC",
        [{ role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" }],
      ),
      true,
    );
    assert.equal(
      shouldNudgeFlashLoanMissingAmount(
        [],
        "use the second strategy",
        [
          { role: "user", content: "flash loan please" },
          { role: "assistant", content: assistantProposal },
        ],
      ),
      false,
    );
  });

  it("shouldNudgeFlashLoanToolRetry after validation error", () => {
    assert.equal(
      shouldNudgeFlashLoanToolRetry(
        [
          {
            name: "query_chain",
            result: { error: { code: "VALIDATION_ERROR", message: "params.asset must be base or quote" } },
          },
        ],
        "execute it",
        [{ role: "user", content: "flash loan 10000 USDC" }],
      ),
      true,
    );
  });

  it("findLastAssistantStrategyProposal returns strategy list", () => {
    const proposal = findLastAssistantStrategyProposal([
      { role: "user", content: "flash loan ideas" },
      { role: "assistant", content: assistantProposal },
    ]);
    assert.ok(proposal);
    assert.match(proposal!, /Arbitrage Strategy/);
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
        [{ role: "user", content: "10000 USDC flash loan" }],
      ),
      false,
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
