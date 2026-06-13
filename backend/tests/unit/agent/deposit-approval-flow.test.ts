import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDepositExecuteNudge,
  extractDepositIntent,
  shouldNudgeDepositExecute,
} from "../../../src/services/agent/deepbook/deposit-approval-flow.js";

describe("deposit-approval-flow", () => {
  it("extractDepositIntent parses deposit 1 sui", () => {
    assert.deepEqual(extractDepositIntent("I want to deposit 1 sui into my deepbook"), {
      coin_key: "SUI",
      amount_display: 1,
    });
  });

  it("extractDepositIntent tolerates leading epost typo", () => {
    assert.deepEqual(
      extractDepositIntent("eposit 1.2 sui into my deepbook balance manager"),
      { coin_key: "SUI", amount_display: 1.2 },
    );
  });

  it("buildDepositExecuteNudge includes amount_display", () => {
    const nudge = buildDepositExecuteNudge({ coin_key: "SUI", amount_display: 1 });
    assert.match(nudge, /amount_display: 1/);
    assert.match(nudge, /deepbook_deposit/);
  });

  it("shouldNudgeDepositExecute after validation error", () => {
    assert.equal(
      shouldNudgeDepositExecute(
        [
          {
            name: "execute_transaction",
            result: {
              error: {
                code: "VALIDATION_ERROR",
                message: "amount required",
              },
            },
          },
        ],
        "deposit 1 sui into deepbook",
      ),
      true,
    );
  });

  it("shouldNudgeDepositExecute is false after approval_required", () => {
    assert.equal(
      shouldNudgeDepositExecute(
        [
          {
            name: "execute_transaction",
            result: {
              status: "approval_required",
              pending: { action: "deepbook_deposit", amount_display: "1 SUI" },
            },
          },
        ],
        "deposit 1 sui",
      ),
      false,
    );
  });
});
