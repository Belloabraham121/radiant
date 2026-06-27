import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import { AppError } from "../../../../src/errors/app-error.js";
import { clearMemoryCacheForTests } from "../../../../src/infrastructure/redis/cache.js";
import { setRedisClientForTests } from "../../../../src/infrastructure/redis/client.js";
import { isStellarRoutingFallbackEligible } from "../../../../src/services/defi/stellar-routing/stellar-routing-fallback.js";

type FallbackServiceModule = typeof import("../../../../src/services/defi/stellar-routing/stellar-routing-fallback.service.js");
type FallbackCacheModule = typeof import("../../../../src/services/defi/stellar-routing/stellar-routing-fallback-cache.js");

const routingIntent = {
  token_in: "XLM",
  token_out: "USDC",
  amount: "10000000",
  chain_id: "sui" as const,
};

before(() => {
  setRedisClientForTests(null);
});

after(() => {
  setRedisClientForTests(undefined);
});

describe("stellar-routing-fallback eligibility", () => {
  it("is eligible for CROSS_ECOSYSTEM_NOT_SUPPORTED", () => {
    const err = new AppError(400, "CROSS_ECOSYSTEM_NOT_SUPPORTED", "not supported");
    assert.equal(isStellarRoutingFallbackEligible(err), true);
  });

  it("is ineligible for SOROSWAP_RATE_LIMITED", () => {
    const err = new AppError(429, "SOROSWAP_RATE_LIMITED", "limited");
    assert.equal(isStellarRoutingFallbackEligible(err), false);
  });
});

describe("stellar-routing-fallback.service", () => {
  let fallbackService: FallbackServiceModule;
  let fallbackCache: FallbackCacheModule;
  let quoteCalls = 0;

  before(async () => {
    [fallbackService, fallbackCache] = await Promise.all([
      import("../../../../src/services/defi/stellar-routing/stellar-routing-fallback.service.js"),
      import("../../../../src/services/defi/stellar-routing/stellar-routing-fallback-cache.js"),
    ]);
  });

  afterEach(() => {
    fallbackService.setGetSoroswapQuoteForTests(null);
    clearMemoryCacheForTests();
    quoteCalls = 0;
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  function enableStellarEnv(): void {
    process.env.SOROSWAP_ENABLED = "true";
    process.env.SOROSWAP_API_KEY = "sk_test_key";
    process.env.ENABLED_CHAINS = "stellar,sui";
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  }

  it("detectStellarRoutingFallback detects wrong-chain Stellar-native swap", () => {
    process.env.ENABLED_CHAINS = "stellar,sui";
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();

    assert.equal(
      fallbackService.detectStellarRoutingFallback({
        originalMessage: "swap XLM to USDC on Sui",
        inputCoin: "XLM",
        outputCoin: "USDC",
        chainId: "sui",
      }),
      true,
    );
    assert.equal(
      fallbackService.detectStellarRoutingFallback({
        originalMessage: "swap XLM to USDC on Stellar",
        inputCoin: "XLM",
        outputCoin: "USDC",
        chainId: "stellar",
      }),
      false,
    );
    assert.equal(
      fallbackService.detectStellarRoutingFallback({
        originalMessage: "swap SUI to USDC",
        inputCoin: "SUI",
        outputCoin: "USDC",
        chainId: "sui",
      }),
      false,
    );
  });

  it("buildStellarRoutingFallbackOffer stores offer with offered status", async () => {
    enableStellarEnv();
    const offer = await fallbackService.buildStellarRoutingFallbackOffer(
      "user-1",
      routingIntent,
      new AppError(400, "CROSS_ECOSYSTEM_NOT_SUPPORTED", "wrong chain"),
    );

    assert.equal(offer.status, "offered");
    assert.equal(offer.token_in, "XLM");
    assert.equal(offer.selected_chain_id, "sui");
    assert.equal(offer.primary_error_code, "CROSS_ECOSYSTEM_NOT_SUPPORTED");

    const stored = await fallbackCache.getStellarRoutingFallbackOffer(offer.fallback_offer_id);
    assert.equal(stored?.status, "offered");
    assert.equal(stored?.privyUserId, "user-1");
  });

  it("acceptStellarRoutingFallback returns mocked quote and marks accepted", async () => {
    enableStellarEnv();
    const offer = await fallbackService.buildStellarRoutingFallbackOffer("user-1", routingIntent);

    fallbackService.setGetSoroswapQuoteForTests(async () => {
      quoteCalls += 1;
      return {
        quote_id: "soroswap:testquote1234",
        quote: { amountIn: "10000000", amountOut: "9900000" },
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      };
    });

    const accepted = await fallbackService.acceptStellarRoutingFallback(
      "user-1",
      offer.fallback_offer_id,
    );
    assert.equal(quoteCalls, 1);
    assert.equal(accepted.quote_id, "soroswap:testquote1234");
    assert.deepEqual(accepted.routing, { primary: "stellar-soroswap" });

    const stored = await fallbackCache.getStellarRoutingFallbackOffer(offer.fallback_offer_id);
    assert.equal(stored?.status, "accepted");
  });

  it("rejectStellarRoutingFallback marks rejected without quote call", async () => {
    enableStellarEnv();
    const offer = await fallbackService.buildStellarRoutingFallbackOffer("user-1", routingIntent);

    fallbackService.setGetSoroswapQuoteForTests(async () => {
      quoteCalls += 1;
      return {
        quote_id: "soroswap:unused",
        quote: {},
        expires_at: null,
      };
    });

    const result = await fallbackService.rejectStellarRoutingFallback(
      "user-1",
      offer.fallback_offer_id,
    );
    assert.deepEqual(result, { status: "rejected" });
    assert.equal(quoteCalls, 0);

    const stored = await fallbackCache.getStellarRoutingFallbackOffer(offer.fallback_offer_id);
    assert.equal(stored?.status, "rejected");
  });
});
