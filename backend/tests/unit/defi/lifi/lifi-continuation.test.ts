import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDeFiApprovalPreview } from "../../../../src/services/agent-transaction/approval-preview/build-preview.js";
import {
  isLifiRouteContinuation,
  markLifiContinuationParams,
} from "../../../../src/services/defi/lifi/lifi-continuation.js";

describe("isLifiRouteContinuation", () => {
  it("detects ACTION_REQUIRED after a completed step", () => {
    const route = {
      steps: [
        { execution: { status: "DONE" }, action: {} },
        { execution: { status: "ACTION_REQUIRED" }, action: {} },
      ],
    };
    assert.equal(isLifiRouteContinuation(route as never), true);
  });

  it("returns false for fresh unrouted steps", () => {
    const route = {
      steps: [{ action: {} }, { action: {} }],
    };
    assert.equal(isLifiRouteContinuation(route as never), false);
  });
});

describe("markLifiContinuationParams", () => {
  it("strips quote expiry fields", () => {
    const params = markLifiContinuationParams({
      route_id: "route-1",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      quote_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(params.lifi_continuation, true);
    assert.equal(params.approval_kind, "lifi_continue");
    assert.equal("expires_at" in params, false);
    assert.equal("quote_expires_at" in params, false);
  });
});

describe("buildDeFiApprovalPreview lifi_continue", () => {
  it("builds destination signing preview without quote expiry", () => {
    const preview = buildDeFiApprovalPreview(
      { title: "Bridge", amount_display: "1 SUI → 0.9 USDC" },
      {
        chain_id: "sui",
        action: "cross_chain_swap",
        params: markLifiContinuationParams({
          from_chain_id: "ethereum",
          to_chain_id: "sui",
          to_token_symbol: "USDC",
          to_amount_display: "0.9",
        }),
      },
      null,
    );

    assert.ok(preview);
    assert.equal(preview!.kind, "lifi_continue");
    assert.equal(preview!.quote_expires_at, null);
    assert.match(preview!.title, /Sign destination transaction/i);
  });
});
