import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coalesceDeFiQuoteExpiresAt,
  DEFI_QUOTE_MAX_REMAINING_MS,
  isDeFiQuoteExpired,
} from "../../../src/services/agent-transaction/approval-preview/quote-expiry.js";
import { LIFI_QUOTE_TTL_MS } from "../../../src/services/defi/lifi/lifi-normalize.js";

describe("coalesceDeFiQuoteExpiresAt", () => {
  it("keeps a valid ~60s quote expiry", () => {
    const now = Date.now();
    const raw = new Date(now + 45_000).toISOString();
    const coalesced = coalesceDeFiQuoteExpiresAt(raw, now);
    assert.equal(coalesced, raw);
  });

  it("replaces bridge ETA (~349 min) masquerading as expires_at", () => {
    const now = Date.now();
    const bridgeEtaMs = 349 * 60 * 1000;
    const raw = new Date(now + bridgeEtaMs).toISOString();
    const coalesced = coalesceDeFiQuoteExpiresAt(raw, now);
    const remaining = Date.parse(coalesced) - now;
    assert.ok(remaining > 0);
    assert.ok(remaining <= DEFI_QUOTE_MAX_REMAINING_MS);
    assert.ok(remaining <= LIFI_QUOTE_TTL_MS + 1_000);
  });

  it("returns fresh 60s expiry when input is missing", () => {
    const now = Date.now();
    const coalesced = coalesceDeFiQuoteExpiresAt(undefined, now);
    const remaining = Date.parse(coalesced) - now;
    assert.ok(Math.abs(remaining - LIFI_QUOTE_TTL_MS) < 1_000);
  });
});

describe("isDeFiQuoteExpired", () => {
  it("does not treat Li-Fi continuation approvals as quote-expired", () => {
    const now = Date.now();
    const stale = new Date(now - 120_000).toISOString();
    assert.equal(
      isDeFiQuoteExpired(
        {
          lifi_continuation: true,
          expires_at: stale,
          quote_expires_at: stale,
        },
        now,
      ),
      false,
    );
  });

  it("still expires initial cross_chain_swap quotes", () => {
    const now = Date.now();
    const stale = new Date(now - 5_000).toISOString();
    assert.equal(
      isDeFiQuoteExpired({ expires_at: stale, to_amount_display: "1.0" }, now),
      true,
    );
  });
});
