import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetDefiCacheConfigForTests } from "../../../src/config/defi-cache.js";
import {
  applyTtlJitter,
  clearDefiCacheForTests,
  defiBalanceCacheKey,
  defiCachedFetch,
  invalidateDefiBalanceCache,
} from "../../../src/services/defi/cache.js";
import { cacheGet } from "../../../src/infrastructure/redis/cache.js";

describe("defi cache", () => {
  afterEach(() => {
    delete process.env.DEFI_CACHE_TTL_JITTER_SECONDS;
    resetDefiCacheConfigForTests();
    clearDefiCacheForTests();
  });

  it("applyTtlJitter stays within base + max jitter", () => {
    for (let i = 0; i < 50; i++) {
      const ttl = applyTtlJitter(30, 5);
      assert.ok(ttl >= 30 && ttl <= 35);
    }
  });

  it("concurrent cache misses invoke fetcher only once (stampede protection)", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { value: calls };
    };

    const results = await Promise.all([
      defiCachedFetch("defi:test:stampede", 30, fetcher),
      defiCachedFetch("defi:test:stampede", 30, fetcher),
      defiCachedFetch("defi:test:stampede", 30, fetcher),
    ]);

    assert.equal(calls, 1);
    assert.deepEqual(results, [{ value: 1 }, { value: 1 }, { value: 1 }]);
  });

  it("does not cache errors from fetcher", async () => {
    const key = "defi:test:error";
    let calls = 0;

    await assert.rejects(
      defiCachedFetch(key, 30, async () => {
        calls += 1;
        throw new Error("upstream failed");
      }),
      /upstream failed/,
    );

    assert.equal(calls, 1);
    assert.equal(await cacheGet(key), null);

    const value = await defiCachedFetch(key, 30, async () => {
      calls += 1;
      return "ok";
    });
    assert.equal(value, "ok");
    assert.equal(calls, 2);
  });

  it("invalidateDefiBalanceCache removes cached balance entry", async () => {
    const key = defiBalanceCacheKey("stellar", "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
    await defiCachedFetch(key, 30, async () => ({ balance: 1 }));
    assert.ok(await cacheGet(key));

    await invalidateDefiBalanceCache(
      "stellar",
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    assert.equal(await cacheGet(key), null);
  });
});
