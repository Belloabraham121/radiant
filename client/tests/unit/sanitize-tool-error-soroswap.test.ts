import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeToolErrorMessage } from "../../src/lib/sanitize-tool-error";

describe("sanitizeToolErrorMessage — soroswap", () => {
  it("returns friendly copy for SOROSWAP_ROUTE_NOT_FOUND", () => {
    const message = sanitizeToolErrorMessage(
      "SOROSWAP_ROUTE_NOT_FOUND: No swap route on Stellar right now.",
    );
    assert.match(message, /No swap route on Stellar/i);
    assert.doesNotMatch(message, /SOROSWAP_ROUTE_NOT_FOUND/);
  });

  it("strips Soroswap API noise and redacts api keys", () => {
    const message = sanitizeToolErrorMessage(
      "soroswap.api failed Authorization Bearer sk_live_secret123 routeStatus",
    );
    assert.doesNotMatch(message, /sk_live_secret123/);
    assert.doesNotMatch(message, /Authorization/i);
    assert.doesNotMatch(message, /routeStatus/i);
  });

  it("returns actionable copy for trustline errors", () => {
    const message = sanitizeToolErrorMessage("op_no_trust: trustline missing for USDC");
    assert.match(message, /trustline/i);
    assert.doesNotMatch(message, /op_no_trust/);
  });

  it("returns actionable copy for reserve / unfunded account errors", () => {
    const message = sanitizeToolErrorMessage(
      "Fund your Stellar wallet with XLM first (minimum reserve applies).",
    );
    assert.match(message, /Fund your Stellar wallet/i);
    assert.match(message, /reserve/i);
  });

  it("parses JSON tool error blobs with soroswap codes", () => {
    const message = sanitizeToolErrorMessage(
      JSON.stringify({
        ok: false,
        code: "SOROSWAP_QUOTE_EXPIRED",
        message: "This quote expired. Getting a fresh quote…",
      }),
    );
    assert.match(message, /quote expired/i);
    assert.doesNotMatch(message, /SOROSWAP_QUOTE_EXPIRED/);
  });
});
