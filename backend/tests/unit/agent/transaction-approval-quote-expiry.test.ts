import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyNonExpiredQuoteExpiryCoalescing } from "../../../src/services/agent/transaction-approval.service.js";

describe("transaction approval quote expiry coalescing", () => {
  it("does not renew TTL before expiry check when quote is already expired", () => {
    const now = Date.now();
    const stale = new Date(now - 60_000).toISOString();
    const result = applyNonExpiredQuoteExpiryCoalescing({
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        expires_at: stale,
        quote_expires_at: stale,
      },
    });

    assert.equal(result.params.expires_at, stale);
    assert.equal(result.params.quote_expires_at, stale);
  });

  it("coalesces fresh quote timestamps for non-expired quotes", () => {
    const now = Date.now();
    const fresh = new Date(now + 30_000).toISOString();
    const result = applyNonExpiredQuoteExpiryCoalescing({
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        expires_at: fresh,
        quote_expires_at: fresh,
      },
    });

    assert.equal(result.params.expires_at, fresh);
    assert.equal(result.params.quote_expires_at, fresh);
  });
});
