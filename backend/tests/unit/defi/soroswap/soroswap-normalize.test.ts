import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import { normalizeSoroswapQuote } from "../../../../src/services/defi/soroswap/soroswap-normalize.js";
import type { SoroswapQuoteResponse } from "../../../../src/services/defi/soroswap/soroswap.types.js";

function enableStellarTokens(): void {
  process.env.ENABLED_CHAINS = "stellar";
  resetChainConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

const quoteFixture: SoroswapQuoteResponse = {
  assetIn: "native",
  assetOut: "CBBMHZEZ65PQJIHKUQITQYFVOH7PIK6MLG2WBWRD2DWZXJKFSV7TFK",
  amountIn: "500000000",
  amountOut: "125000000",
  tradeType: "EXACT_IN",
  expiresAt: "2026-06-27T12:00:00.000Z",
};

describe("soroswap-normalize", () => {
  beforeEach(() => {
    enableStellarTokens();
  });

  afterEach(() => {
    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("normalizes Soroswap quote to StellarSwapQuote with soroswap route id", () => {
    const quoteId = "soroswap:deadbeefcafebabe";
    const normalized = normalizeSoroswapQuote({
      token_in: "XLM",
      token_out: "USDC",
      quote_id: quoteId,
      quote: quoteFixture,
    });

    assert.equal(normalized.provider_id, "stellar-soroswap");
    assert.equal(normalized.quote_id, quoteId);
    assert.equal(normalized.route_id, quoteId);
    assert.equal(normalized.pool_key, "XLM_USDC");
    assert.equal(normalized.input_coin, "XLM");
    assert.equal(normalized.output_coin, "USDC");
    assert.equal(normalized.input_amount_atomic, "500000000");
    assert.equal(normalized.output_amount_atomic, "125000000");
    assert.equal(normalized.input_amount_display, 50);
    assert.equal(normalized.output_amount_display, 12.5);
    assert.equal(normalized.price, 0.25);
    assert.equal(normalized.fee_deep, null);
    assert.equal(normalized.expires_at, "2026-06-27T12:00:00.000Z");
    assert.equal(normalized.provider_payload?.kind, "soroswap");
    if (normalized.provider_payload?.kind === "soroswap") {
      assert.equal(normalized.provider_payload.quote_id, quoteId);
      assert.equal(normalized.provider_payload.quote.amountOut, "125000000");
    }
  });
});
