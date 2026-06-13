import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWithdrawExecuteNudge,
  extractWithdrawIntent,
  shouldNudgeWithdrawBalanceQuery,
  shouldNudgeWithdrawExecute,
} from "../../../src/services/agent/deepbook/withdraw-approval-flow.js";

describe("withdraw-approval-flow", () => {
  it("extractWithdrawIntent parses withdraw all my sui", () => {
    assert.deepEqual(
      extractWithdrawIntent("withdraw all my sui from my deepbook manager"),
      { coin_key: "SUI", withdraw_all: true },
    );
  });

  it("buildWithdrawExecuteNudge uses withdraw_all true", () => {
    const nudge = buildWithdrawExecuteNudge({ coin_key: "SUI", withdraw_all: true });
    assert.match(nudge, /withdraw_all: true/);
    assert.doesNotMatch(nudge, /amount_display: 0/);
  });

  it("shouldNudgeWithdrawBalanceQuery when no balance read yet", () => {
    assert.equal(
      shouldNudgeWithdrawBalanceQuery([], "withdraw all my sui from deepbook"),
      true,
    );
  });

  it("shouldNudgeWithdrawExecute after balance query", () => {
    assert.equal(
      shouldNudgeWithdrawExecute(
        [
          {
            name: "query_chain",
            result: {
              balances: [{ coin_key: "SUI", balance_display: 1, coin_type: "0x2::sui::SUI" }],
            },
          },
        ],
        "withdraw all my sui",
      ),
      true,
    );
  });
});
