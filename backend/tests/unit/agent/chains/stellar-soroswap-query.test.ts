import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AppError } from "../../../../src/errors/app-error.js";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import { clearDefiCacheForTests } from "../../../../src/services/defi/cache.js";
import { setRedisClientForTests } from "../../../../src/infrastructure/redis/client.js";
import { resolveQueryHandler } from "../../../../src/services/agent/chains/registry.js";
import {
  getStellarSoroswapQueryHandler,
  STELLAR_SOROSWAP_QUERY_HANDLERS,
} from "../../../../src/services/agent/chains/stellar/soroswap/query-handlers.js";
import {
  resetSoroswapClientForTests,
  setSoroswapFetchImplForTests,
} from "../../../../src/services/defi/soroswap/soroswap.client.js";
import { setResolveSoroswapWalletAddressForTests } from "../../../../src/services/defi/soroswap/soroswap-wallet-addresses.js";
import { setGetSoroswapTokensForTests } from "../../../../src/services/defi/soroswap/soroswap-token-catalog.service.js";
import type { SoroswapToken } from "../../../../src/services/defi/soroswap/soroswap.types.js";
import type { QueryHandlerContext } from "../../../../src/services/agent/chains/types.js";

const STELLAR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const PRIVY_USER = "did:privy:test-stellar-swap";

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

function enableSoroswapEnv(): void {
  process.env.SOROSWAP_ENABLED = "true";
  process.env.SOROSWAP_API_KEY = "sk_test_key";
}

function baseContext(overrides?: Partial<QueryHandlerContext>): QueryHandlerContext {
  return {
    privyUserId: PRIVY_USER,
    chainId: "stellar",
    query: "stellar_swap_quote",
    params: {
      token_in: "XLM",
      token_out: "USDC",
      amount: "100000000",
    },
    walletAddress: STELLAR,
    ...overrides,
  };
}

function mockQuoteFetch(expiresAt: string): void {
  setSoroswapFetchImplForTests(async (url, init) => {
    const path = String(url);
    if (path.includes("/health")) {
      return new Response(JSON.stringify({ status: "ok", protocols: ["soroswap"] }), {
        status: 200,
      });
    }
    if (path.includes("/quote") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          amountIn: "100000000",
          amountOut: "25000000",
          tradeType: "EXACT_IN",
          expiresAt,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ message: "unexpected" }), { status: 500 });
  });
}

describe("stellar soroswap query handlers", () => {
  beforeEach(() => {
    enableStellarEnv();
    enableSoroswapEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
  });

  afterEach(() => {
    resetSoroswapClientForTests();
    setResolveSoroswapWalletAddressForTests(null);
    setGetSoroswapTokensForTests(null);
    clearDefiCacheForTests();
    setRedisClientForTests(null);
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("registers stellar_swap_quote handler", () => {
    assert.equal(typeof STELLAR_SOROSWAP_QUERY_HANDLERS.stellar_swap_quote, "function");
    assert.equal(getStellarSoroswapQueryHandler("stellar_swap_quote"), STELLAR_SOROSWAP_QUERY_HANDLERS.stellar_swap_quote);
    assert.equal(getStellarSoroswapQueryHandler("unknown"), null);
  });

  it("resolveQueryHandler dispatches stellar_swap_quote on stellar", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mockQuoteFetch(expiresAt);

    const handler = resolveQueryHandler("stellar", "stellar_swap_quote");
    assert.equal(typeof handler, "function");

    const result = await handler!(baseContext());
    assert.equal(result.provider_id, "stellar-soroswap");
    assert.match(result.route_id!, /^soroswap:/);
  });

  it("returns normalized quote with route_id and expires_at", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mockQuoteFetch(expiresAt);

    const result = await STELLAR_SOROSWAP_QUERY_HANDLERS.stellar_swap_quote!(baseContext());

    assert.equal(result.chain_id, "stellar");
    assert.equal(result.provider_id, "stellar-soroswap");
    assert.equal(result.input_coin, "XLM");
    assert.equal(result.output_coin, "USDC");
    assert.equal(result.input_amount_atomic, "100000000");
    assert.equal(result.output_amount_atomic, "25000000");
    assert.equal(typeof result.quote_id, "string");
    assert.match(result.quote_id!, /^soroswap:/);
    assert.equal(result.route_id, result.quote_id);
    assert.equal(result.expires_at, expiresAt);
    assert.equal(result.provider_payload?.kind, "soroswap");
  });

  it("accepts input_coin/output_coin and amount_atomic aliases", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mockQuoteFetch(expiresAt);

    const result = await STELLAR_SOROSWAP_QUERY_HANDLERS.stellar_swap_quote!(
      baseContext({
        params: {
          input_coin: "XLM",
          output_coin: "USDC",
          amount_atomic: "50000000",
        },
      }),
    );

    assert.equal(result.input_coin, "XLM");
    assert.equal(result.output_coin, "USDC");
    assert.equal(result.input_amount_atomic, "100000000");
  });

  it("rejects non-stellar chain_id", async () => {
    await assert.rejects(
      STELLAR_SOROSWAP_QUERY_HANDLERS.stellar_swap_quote!(
        baseContext({ chainId: "sui" }),
      ),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "UNSUPPORTED_QUERY" &&
        err.message.includes("Stellar"),
    );
  });

  it("hard-fails SOROSWAP_ROUTE_NOT_FOUND without routing fallback", async () => {
    setSoroswapFetchImplForTests(async (url) => {
      const path = String(url);
      if (path.includes("/health")) {
        return new Response(JSON.stringify({ status: "ok", protocols: ["soroswap"] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ message: "no route found" }), { status: 404 });
    });

    await assert.rejects(
      STELLAR_SOROSWAP_QUERY_HANDLERS.stellar_swap_quote!(baseContext()),
      (err: unknown) => {
        if (!(err instanceof AppError)) {
          return false;
        }
        assert.equal(err.code, "SOROSWAP_ROUTE_NOT_FOUND");
        assert.match(err.message, /No swap route on Stellar/i);
        assert.equal(
          (err as AppError & { stellar_routing_fallback_offer?: unknown }).stellar_routing_fallback_offer,
          undefined,
        );
        return true;
      },
    );
  });

  it("rejects when Soroswap is disabled", async () => {
    delete process.env.SOROSWAP_ENABLED;

    await assert.rejects(
      STELLAR_SOROSWAP_QUERY_HANDLERS.stellar_swap_quote!(baseContext()),
      (err: unknown) => err instanceof AppError && err.code === "SOROSWAP_UNAVAILABLE",
    );
  });
});
