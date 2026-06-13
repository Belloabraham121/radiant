import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlashLoanExecuteNudge,
  extractFlashLoanIntent,
  extractFlashLoanIntentFromMessages,
  isAffirmativeFlashLoanReply,
  shouldNudgeFlashLoanExecute,
  shouldNudgeFlashLoanMissingAmount,
  userRequestedFlashLoan,
} from "../../../src/services/agent/flash-loan-approval-flow.js";

describe("flash-loan-approval-flow", () => {
  it("detects flash loan requests", () => {
    assert.equal(userRequestedFlashLoan("trigger a flash loan between pools"), true);
  });

  it("extractFlashLoanIntent parses 10000 USDC", () => {
    const intent = extractFlashLoanIntent("I want to use 10000 USDC");
    assert.ok(intent);
    assert.equal(intent.borrow_amount, 10000);
    assert.equal(intent.coin_key, "USDC");
    assert.equal(intent.asset, "quote");
  });

  it("buildFlashLoanExecuteNudge includes execute_transaction params", () => {
    const nudge = buildFlashLoanExecuteNudge({
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      asset: "quote",
      coin_key: "USDC",
    });
    assert.match(nudge, /deepbook_flash_loan/);
    assert.match(nudge, /borrow_amount: 10000/);
    assert.match(nudge, /flash_loan_quote/);
    assert.match(nudge, /do not ask me to confirm/i);
  });

  it("shouldNudgeFlashLoanExecute when amount provided but no execute", () => {
    assert.equal(
      shouldNudgeFlashLoanExecute([], "I want to use 10000 USDC", [
        { role: "user", content: "flash loan between SUI_USDC and DEEP_USDC" },
        { role: "assistant", content: "Please confirm" },
        { role: "user", content: "I want to use 10000 USDC" },
      ]),
      true,
    );
  });

  it("shouldNudgeFlashLoanExecute when user says yes after stating amount", () => {
    assert.equal(
      shouldNudgeFlashLoanExecute([], "yes", [
        { role: "user", content: "flash loan please" },
        { role: "user", content: "10000 USDC" },
      ]),
      true,
    );
    assert.equal(isAffirmativeFlashLoanReply("yes"), true);
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

  it("extractFlashLoanIntentFromMessages finds latest amount", () => {
    const intent = extractFlashLoanIntentFromMessages([
      { role: "user", content: "flash loan please" },
      { role: "user", content: "use 5000 USDC" },
    ]);
    assert.ok(intent);
    assert.equal(intent.borrow_amount, 5000);
  });
});
