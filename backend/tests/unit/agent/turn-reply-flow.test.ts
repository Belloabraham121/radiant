import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
    assert.equal(
      shouldNudgeReplyAfterTools([
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
      shouldNudgeReplyAfterTools([
        {
          name: "query_chain",
          result: {
            pools: [{ pool_key: "SUI_USDC", base_coin: "SUI", quote_coin: "USDC" }],
            default_pool: "SUI_USDC",
          },
        },
        {
          name: "execute_transaction",
          result: { status: "approval_required", pending: { action: "swap" } },
        },
      ]),
      false,
    );
  });
});
