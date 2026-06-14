import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSwapQuoteExpired,
  isSwapQuoteFresh,
  readQuoteExpiresAt,
} from "../../../src/services/agent/deepbook/swap-quote-enrichment.js";

describe("swap-quote-enrichment", () => {
  it("reads quote_expires_at from params", () => {
    const expires = new Date(Date.now() + 30_000).toISOString();
    assert.equal(readQuoteExpiresAt({ quote_expires_at: expires }), expires);
    assert.equal(readQuoteExpiresAt({}), null);
  });

  it("detects fresh and expired quotes", () => {
    const fresh = {
      quote_expires_at: new Date(Date.now() + 30_000).toISOString(),
      estimated_out_display: 12.5,
    };
    assert.equal(isSwapQuoteFresh(fresh), true);
    assert.equal(isSwapQuoteExpired(fresh), false);

    const expired = {
      quote_expires_at: new Date(Date.now() - 1_000).toISOString(),
      estimated_out_display: 12.5,
    };
    assert.equal(isSwapQuoteFresh(expired), false);
    assert.equal(isSwapQuoteExpired(expired), true);
  });
});
