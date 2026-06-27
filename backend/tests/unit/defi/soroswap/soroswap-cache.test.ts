import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetDefiCacheConfigForTests } from "../../../../src/config/defi-cache.js";
import { clearDefiCacheForTests } from "../../../../src/services/defi/cache.js";
import {
  getStoredSoroswapQuote,
  soroswapCachedQuoteFetch,
  soroswapHealthCacheKey,
  soroswapQuoteCacheKey,
  soroswapQuoteStoreKey,
  soroswapTokensCacheKey,
  storeSoroswapQuote,
} from "../../../../src/services/defi/soroswap/soroswap-cache.js";
import { SOROSWAP_QUOTE_TTL_MS } from "../../../../src/services/defi/soroswap/soroswap-normalize.js";
import { cacheGet } from "../../../../src/infrastructure/redis/cache.js";

describe("soroswap cache", () => {
  afterEach(() => {
    delete process.env.SOROSWAP_NETWORK;
    delete process.env.SOROSWAP_QUOTE_CACHE_TTL_SECONDS;
    resetDefiCacheConfigForTests();
    clearDefiCacheForTests();
  });

  it("builds stable catalog and quote cache keys", () => {
    process.env.SOROSWAP_NETWORK = "mainnet";
    assert.equal(soroswapTokensCacheKey(), "defi:soroswap:catalog:tokens:mainnet");
    assert.equal(soroswapHealthCacheKey(), "defi:soroswap:catalog:health:mainnet");

    const keyA = soroswapQuoteCacheKey({
      network: "mainnet",
      assetIn: "A",
      assetOut: "B",
      amount: "100",
      tradeType: "EXACT_IN",
      slippageBps: 100,
      protocols: ["aqua", "soroswap"],
    });
    const keyB = soroswapQuoteCacheKey({
      network: "mainnet",
      assetIn: "A",
      assetOut: "B",
      amount: "100",
      tradeType: "EXACT_IN",
      slippageBps: 100,
      protocols: ["aqua", "soroswap"],
    });
    assert.equal(keyA, keyB);
    assert.match(keyA, /^defi:soroswap:quote:[a-f0-9]{16}$/);
  });

  it("stores and retrieves quote payloads by quote id", async () => {
    const quoteId = "soroswap:abc123";
    assert.equal(soroswapQuoteStoreKey(quoteId), "defi:soroswap:route:soroswap:abc123");

    await storeSoroswapQuote(quoteId, {
      quote_id: quoteId,
      quote: { amountIn: "1", amountOut: "2" },
      stored_at: new Date().toISOString(),
      expires_at: null,
      raw_request: {
        assetIn: "A",
        assetOut: "B",
        amount: "1",
        tradeType: "EXACT_IN",
      },
    });

    const stored = await getStoredSoroswapQuote(quoteId);
    assert.ok(stored);
    assert.equal(stored.quote_id, quoteId);
    assert.equal(stored.quote.amountOut, "2");
  });

  it("uses SOROSWAP_QUOTE_TTL_MS default for quote store (~60s)", () => {
    assert.equal(SOROSWAP_QUOTE_TTL_MS, 60_000);
    assert.equal(Math.ceil(SOROSWAP_QUOTE_TTL_MS / 1000), 60);
  });

  it("concurrent soroswapCachedQuoteFetch invokes fetcher only once", async () => {
    let calls = 0;
    const params = {
      network: "mainnet",
      assetIn: "A",
      assetOut: "B",
      amount: "100",
      tradeType: "EXACT_IN",
      slippageBps: 100,
      protocols: ["soroswap"],
    };

    const fetcher = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { amountOut: "99" };
    };

    const results = await Promise.all([
      soroswapCachedQuoteFetch(params, fetcher),
      soroswapCachedQuoteFetch(params, fetcher),
      soroswapCachedQuoteFetch(params, fetcher),
    ]);

    assert.equal(calls, 1);
    assert.deepEqual(results, [{ amountOut: "99" }, { amountOut: "99" }, { amountOut: "99" }]);
  });

  it("does not cache failed quote fetch", async () => {
    const params = {
      network: "mainnet",
      assetIn: "A",
      assetOut: "B",
      amount: "100",
      tradeType: "EXACT_IN",
      slippageBps: 100,
      protocols: ["soroswap"],
    };
    let calls = 0;

    await assert.rejects(
      soroswapCachedQuoteFetch(params, async () => {
        calls += 1;
        throw new Error("quote upstream failed");
      }),
      /quote upstream failed/,
    );

    assert.equal(calls, 1);
    assert.equal(await cacheGet(soroswapQuoteCacheKey(params)), null);

    const value = await soroswapCachedQuoteFetch(params, async () => {
      calls += 1;
      return { amountOut: "42" };
    });
    assert.equal(value.amountOut, "42");
    assert.equal(calls, 2);
  });

  it("honors skipCache without writing dedupe cache", async () => {
    const params = {
      network: "mainnet",
      assetIn: "A",
      assetOut: "B",
      amount: "100",
      tradeType: "EXACT_IN",
      slippageBps: 100,
      protocols: ["soroswap"],
    };
    let calls = 0;

    await soroswapCachedQuoteFetch(
      params,
      async () => {
        calls += 1;
        return { amountOut: "1" };
      },
      { skipCache: true },
    );

    assert.equal(calls, 1);
    assert.equal(await cacheGet(soroswapQuoteCacheKey(params)), null);
  });
});
