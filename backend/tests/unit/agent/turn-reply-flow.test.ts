import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReplyAfterToolsNudge,
  hasSuccessfulQueryResults,
  isSuccessfulToolResult,
  shouldNudgeReplyAfterTools,
} from "../../../src/services/agent/turn-reply-flow.js";

describe("turn-reply-flow", () => {
  it("isSuccessfulToolResult rejects error payloads", () => {
    assert.equal(isSuccessfulToolResult({ balance_display: 1 }), true);
    assert.equal(isSuccessfulToolResult({ error: { code: "X", message: "fail" } }), false);
  });

  it("hasSuccessfulQueryResults when query_chain succeeded", () => {
    assert.equal(
      hasSuccessfulQueryResults([
        {
          name: "query_chain",
          result: {
            pools: [{ pool_key: "SUI_USDC", base_coin: "SUI", quote_coin: "USDC" }],
            default_pool: "SUI_USDC",
          },
        },
      ]),
      true,
    );
    assert.equal(
      hasSuccessfulQueryResults([
        {
          name: "query_chain",
          result: { error: { code: "VALIDATION_ERROR", message: "bad params" } },
        },
      ]),
      false,
    );
  });

  it("shouldNudgeReplyAfterTools when data fetched but no transaction outcome", () => {
    const poolQuery = [
      {
        name: "query_chain",
        result: {
          pools: [{ pool_key: "SUI_USDC", base_coin: "SUI", quote_coin: "USDC" }],
          default_pool: "SUI_USDC",
        },
      },
    ] as const;

    assert.equal(shouldNudgeReplyAfterTools([...poolQuery]), true);
    assert.equal(
      shouldNudgeReplyAfterTools([...poolQuery], "Here are the pools that support flash loans."),
      false,
    );
    assert.equal(
      shouldNudgeReplyAfterTools([
        ...poolQuery,
        {
          name: "execute_transaction",
          result: { status: "approval_required", pending: { action: "swap" } },
        },
      ]),
      false,
    );
  });

  it("buildReplyAfterToolsNudge includes flash loan research guidance for quote-only turns", () => {
    const quote = {
      strategy: "swap_chain_repay",
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      coin_key: "USDC",
      repay_feasible: false,
      steps: [],
      warnings: [],
    };
    const nudge = buildReplyAfterToolsNudge([{ name: "query_chain", result: quote }]);
    assert.ok(nudge.includes("exploring flash loans"));
    assert.ok(nudge.includes("Do not call execute_transaction"));
  });
});
