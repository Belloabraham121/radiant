import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearDefiCacheForTests } from "../../../../src/services/defi/cache.js";
import { setRedisClientForTests } from "../../../../src/infrastructure/redis/client.js";
import {
  buildSoroswapTransaction,
  setSoroswapBuildStellarHooksForTests,
} from "../../../../src/services/defi/soroswap/soroswap-build.service.js";
import { storeSoroswapQuote } from "../../../../src/services/defi/soroswap/soroswap-cache.js";
import {
  executeSoroswapSwap,
  setSoroswapExecuteHooksForTests,
} from "../../../../src/services/defi/soroswap/soroswap-execute.service.js";
import {
  resetSoroswapClientForTests,
  setSoroswapFetchImplForTests,
} from "../../../../src/services/defi/soroswap/soroswap.client.js";
import { setResolveSoroswapWalletAddressForTests } from "../../../../src/services/defi/soroswap/soroswap-wallet-addresses.js";
import { setGetSoroswapTokensForTests } from "../../../../src/services/defi/soroswap/soroswap-token-catalog.service.js";
import type { SoroswapStoredQuotePayload, SoroswapToken } from "../../../../src/services/defi/soroswap/soroswap.types.js";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import { AppError } from "../../../../src/errors/app-error.js";

const STELLAR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const QUOTE_ID = "soroswap:executetest123";
const TX_HASH = "abc123def4567890abc123def4567890abc123def4567890abc123def4567890";

const catalogTokens: SoroswapToken[] = [
  { address: "native", symbol: "XLM", decimals: 7, name: "Stellar Lumens", type: "native" },
  {
    address: "USDC:GA5ZSEJY2YZN5OMRE3KK6QANRT6WK463FHAI3BYT5PBSHH5BYKHARY",
    symbol: "USDC",
    decimals: 7,
    name: "USD Coin",
    type: "classic",
    issuer: "GA5ZSEJY2YZN5OMRE3KK6QANRT6WK463FHAI3BYT5PBSHH5BYKHARY",
  },
];

function enableStellarEnv(): void {
  process.env.ENABLED_CHAINS = "stellar";
  resetChainConfigCacheForTests();
  resetSupportedTokensCacheForTests();
  setGetSoroswapTokensForTests(async () => catalogTokens);
}

function soroswapFetchWithHealth(
  handler: (url: string | URL, init?: RequestInit) => Promise<Response>,
): void {
  setSoroswapFetchImplForTests(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok", protocols: ["soroswap"] }), { status: 200 });
    }
    return handler(url, init);
  });
}

function enableSoroswapEnv(): void {
  process.env.SOROSWAP_ENABLED = "true";
  process.env.SOROSWAP_API_KEY = "sk_test_key";
}

const MOCK_WALLET = {
  privy_wallet_id: "wallet-test-1",
  address: STELLAR,
  signer_added: true,
};

function mockExecuteHooks(overrides?: Partial<Parameters<typeof setSoroswapExecuteHooksForTests>[0]>) {
  setSoroswapExecuteHooksForTests({
    resolveSigningWallet: async () => MOCK_WALLET,
    parseXdr: () => ({}) as never,
    ...overrides,
  });
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

describe("soroswap-execute.service", () => {
  afterEach(() => {
    resetSoroswapClientForTests();
    setResolveSoroswapWalletAddressForTests(null);
    setGetSoroswapTokensForTests(null);
    setSoroswapBuildStellarHooksForTests(null);
    setSoroswapExecuteHooksForTests(null);
    clearDefiCacheForTests();
    setRedisClientForTests(null);
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("rejects when Soroswap is disabled", async () => {
    delete process.env.SOROSWAP_ENABLED;
    await assert.rejects(
      executeSoroswapSwap("user-1", { quote_id: QUOTE_ID }),
      (err: unknown) => err instanceof AppError && err.code === "SOROSWAP_UNAVAILABLE",
    );
  });

  it("rejects missing quote_id and route_id", async () => {
    enableSoroswapEnv();
    await assert.rejects(
      executeSoroswapSwap("user-1", {}),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("executes swap end-to-end with mocked build, signing, status, and cache invalidation", async () => {
    enableSoroswapEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
    setSoroswapBuildStellarHooksForTests({
      parseXdr: () => ({}) as never,
      simulate: async () => {},
    });

    await storeSoroswapQuote(QUOTE_ID, storedQuotePayload());

    let invalidateCalled = false;

    mockExecuteHooks({
      executeSigned: async () => ({
        hash: TX_HASH,
        stellar_address: STELLAR,
        effects_status: "unknown",
      }),
      invalidateBalance: async () => {
        invalidateCalled = true;
      },
      fetchSwapStatus: async () => ({
        tx_hash: TX_HASH,
        status: "success",
        ledger: 12345,
        successful: true,
      }),
    });

    setSoroswapFetchImplForTests(async () =>
      new Response(JSON.stringify({ xdr: "AAAA-test-xdr" }), { status: 200 }),
    );

    const result = await executeSoroswapSwap("user-1", {
      quote_id: QUOTE_ID,
      route_id: QUOTE_ID,
    });

    assert.equal(result.tx_hash, TX_HASH);
    assert.equal(result.quote_id, QUOTE_ID);
    assert.equal(result.route_id, QUOTE_ID);
    assert.equal(result.ledger, 12345);
    assert.equal(result.effects_status, "success");
    assert.equal(result.tracking_status, "success");
    assert.equal(invalidateCalled, true);
  });

  it("returns pending effects when Horizon has not indexed the tx yet", async () => {
    enableSoroswapEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
    setSoroswapBuildStellarHooksForTests({
      parseXdr: () => ({}) as never,
      simulate: async () => {},
    });
    await storeSoroswapQuote(QUOTE_ID, storedQuotePayload());

    let invalidateCalled = false;
    mockExecuteHooks({
      executeSigned: async () => ({
        hash: TX_HASH,
        stellar_address: STELLAR,
        effects_status: "unknown",
      }),
      invalidateBalance: async () => {
        invalidateCalled = true;
      },
      fetchSwapStatus: async () => ({
        tx_hash: TX_HASH,
        status: "pending",
      }),
    });

    setSoroswapFetchImplForTests(async () =>
      new Response(JSON.stringify({ xdr: "AAAA-test-xdr" }), { status: 200 }),
    );

    const result = await executeSoroswapSwap("user-1", { quote_id: QUOTE_ID });

    assert.equal(result.effects_status, "pending");
    assert.equal(result.tracking_status, "pending");
    assert.equal(invalidateCalled, false);
  });

  it("enqueues swap tracking when tx is pending and transactionId provided", async () => {
    enableSoroswapEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
    setSoroswapBuildStellarHooksForTests({
      parseXdr: () => ({}) as never,
      simulate: async () => {},
    });
    await storeSoroswapQuote(QUOTE_ID, storedQuotePayload());

    const enqueued: Array<{ transactionId: string; txHash: string }> = [];
    mockExecuteHooks({
      executeSigned: async () => ({
        hash: TX_HASH,
        stellar_address: STELLAR,
        effects_status: "unknown",
      }),
      fetchSwapStatus: async () => ({
        tx_hash: TX_HASH,
        status: "pending",
      }),
      enqueueTracking: async (job) => {
        enqueued.push({ transactionId: job.transactionId, txHash: job.txHash });
      },
    });

    setSoroswapFetchImplForTests(async () =>
      new Response(JSON.stringify({ xdr: "AAAA-test-xdr" }), { status: 200 }),
    );

    await executeSoroswapSwap(
      "user-1",
      { quote_id: QUOTE_ID },
      { transactionId: "11111111-1111-4111-8111-111111111111", sessionId: "session-1" },
    );

    assert.equal(enqueued.length, 1);
    assert.equal(enqueued[0]?.transactionId, "11111111-1111-4111-8111-111111111111");
    assert.equal(enqueued[0]?.txHash, TX_HASH);
  });

  it("re-quotes from snapshot when stored quote expired", async () => {
    enableSoroswapEnv();
    enableStellarEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
    setSoroswapBuildStellarHooksForTests({
      parseXdr: () => ({}) as never,
      simulate: async () => {},
    });

    const expiredPayload = storedQuotePayload();
    expiredPayload.expires_at = new Date(Date.now() - 1_000).toISOString();
    expiredPayload.quote.expiresAt = expiredPayload.expires_at;
    await storeSoroswapQuote(QUOTE_ID, expiredPayload);

    let quoteCalls = 0;

    soroswapFetchWithHealth(async (url) => {
      const path = String(url);
      if (path.includes("/quote") && !path.includes("/quote/build")) {
        quoteCalls += 1;
        const payload = {
          amountIn: "10000000",
          amountOut: "2600000",
          tradeType: "EXACT_IN",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        return new Response(JSON.stringify(payload), { status: 200 });
      }
      return new Response(JSON.stringify({ xdr: "AAAA-refreshed-xdr" }), { status: 200 });
    });

    mockExecuteHooks({
      executeSigned: async () => ({
        hash: TX_HASH,
        stellar_address: STELLAR,
        effects_status: "unknown",
      }),
      fetchSwapStatus: async () => ({
        tx_hash: TX_HASH,
        status: "pending",
      }),
    });

    const result = await executeSoroswapSwap("user-1", {
      quote_id: QUOTE_ID,
      token_in: "XLM",
      token_out: "USDC",
      amount: "10000000",
    });

    assert.equal(quoteCalls, 1);
    assert.notEqual(result.quote_id, QUOTE_ID);
    assert.match(result.quote_id, /^soroswap:/);
  });
});

describe("soroswap-build.service execute integration", () => {
  afterEach(() => {
    resetSoroswapClientForTests();
    setResolveSoroswapWalletAddressForTests(null);
    setGetSoroswapTokensForTests(null);
    setSoroswapBuildStellarHooksForTests(null);
    clearDefiCacheForTests();
    setRedisClientForTests(null);
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("passes snapshot params through build quote resolution", async () => {
    enableSoroswapEnv();
    enableStellarEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
    setSoroswapBuildStellarHooksForTests({
      parseXdr: () => ({}) as never,
      simulate: async () => {},
    });

    const expiredPayload = storedQuotePayload();
    expiredPayload.expires_at = new Date(Date.now() - 1_000).toISOString();
    await storeSoroswapQuote(QUOTE_ID, expiredPayload);

    const refreshedId = "soroswap:buildrefresh01";
    soroswapFetchWithHealth(async (url) => {
      const path = String(url);
      if (path.includes("/quote") && !path.includes("/quote/build")) {
        const payload = {
          amountIn: "10000000",
          amountOut: "2600000",
          tradeType: "EXACT_IN",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        await storeSoroswapQuote(refreshedId, {
          quote_id: refreshedId,
          quote: payload,
          stored_at: new Date().toISOString(),
          expires_at: payload.expiresAt,
          raw_request: expiredPayload.raw_request,
        });
        return new Response(JSON.stringify(payload), { status: 200 });
      }
      return new Response(JSON.stringify({ xdr: "AAAA-test-xdr" }), { status: 200 });
    });

    const result = await buildSoroswapTransaction("user-1", {
      quoteId: QUOTE_ID,
      snapshotParams: {
        token_in: "XLM",
        token_out: "USDC",
        amount: "10000000",
      },
    });

    assert.equal(result.xdr, "AAAA-test-xdr");
  });
});
