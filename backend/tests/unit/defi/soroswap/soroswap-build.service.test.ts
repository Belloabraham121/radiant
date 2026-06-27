import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { clearDefiCacheForTests } from "../../../../src/services/defi/cache.js";
import { setRedisClientForTests } from "../../../../src/infrastructure/redis/client.js";
import {
  buildSoroswapTransaction,
  setSoroswapBuildStellarHooksForTests,
} from "../../../../src/services/defi/soroswap/soroswap-build.service.js";
import { storeSoroswapQuote } from "../../../../src/services/defi/soroswap/soroswap-cache.js";
import {
  resetSoroswapClientForTests,
  setSoroswapFetchImplForTests,
} from "../../../../src/services/defi/soroswap/soroswap.client.js";
import { setResolveSoroswapWalletAddressForTests } from "../../../../src/services/defi/soroswap/soroswap-wallet-addresses.js";
import type { SoroswapStoredQuotePayload } from "../../../../src/services/defi/soroswap/soroswap.types.js";
import { AppError } from "../../../../src/errors/app-error.js";

const STELLAR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const QUOTE_ID = "soroswap:buildtest1234";

function enableSoroswapEnv(): void {
  process.env.SOROSWAP_ENABLED = "true";
  process.env.SOROSWAP_API_KEY = "sk_test_key";
}

function storedQuotePayload(): SoroswapStoredQuotePayload {
  return {
    quote_id: QUOTE_ID,
    quote: {
      amountIn: "10000000",
      amountOut: "2500000",
      tradeType: "EXACT_IN",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    stored_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    raw_request: {
      assetIn: "native",
      assetOut: "CBBMHZEZ65PQJIHKUQITQYFVOH7PIK6MLG2WBWRD2DWZXJKFSV7TFK",
      amount: "10000000",
      tradeType: "EXACT_IN",
      from: STELLAR,
    },
  };
}

describe("soroswap-build.service", () => {
  afterEach(() => {
    resetSoroswapClientForTests();
    setResolveSoroswapWalletAddressForTests(null);
    setSoroswapBuildStellarHooksForTests(null);
    clearDefiCacheForTests();
    setRedisClientForTests(null);
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
  });

  after(() => {
    setRedisClientForTests(undefined);
  });

  it("rejects when Soroswap is disabled", async () => {
    delete process.env.SOROSWAP_ENABLED;
    await assert.rejects(
      buildSoroswapTransaction("user-1", { quoteId: QUOTE_ID }),
      (err: unknown) => err instanceof AppError && err.code === "SOROSWAP_UNAVAILABLE",
    );
  });

  it("rejects missing quoteId", async () => {
    enableSoroswapEnv();
    await assert.rejects(
      buildSoroswapTransaction("user-1", { quoteId: "  " }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("rejects when stored quote is missing", async () => {
    enableSoroswapEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);

    await assert.rejects(
      buildSoroswapTransaction("user-1", { quoteId: QUOTE_ID }),
      (err: unknown) => err instanceof AppError && err.code === "SOROSWAP_QUOTE_EXPIRED",
    );
  });

  it("builds unsigned XDR from stored quote with mocked client and simulation", async () => {
    enableSoroswapEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
    setSoroswapBuildStellarHooksForTests({
      parseXdr: () => ({}) as never,
      simulate: async () => {},
    });

    await storeSoroswapQuote(QUOTE_ID, storedQuotePayload());

    let buildPath = "";
    let buildBody: unknown;

    setSoroswapFetchImplForTests(async (url, init) => {
      buildPath = String(url);
      buildBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      return new Response(JSON.stringify({ xdr: "AAAA-test-xdr" }), { status: 200 });
    });

    const result = await buildSoroswapTransaction("user-1", {
      quoteId: QUOTE_ID,
      routeId: QUOTE_ID,
    });

    assert.equal(result.xdr, "AAAA-test-xdr");
    assert.match(buildPath, /\/quote\/build/);
    assert.equal((buildBody as { from?: string }).from, STELLAR);
    assert.equal((buildBody as { quote?: { amountIn?: string } }).quote?.amountIn, "10000000");
  });
});
