import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import type { Route } from "@lifi/types";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import { AppError } from "../../../../src/errors/app-error.js";
import { clearMemoryCacheForTests } from "../../../../src/infrastructure/redis/cache.js";
import { setRedisClientForTests } from "../../../../src/infrastructure/redis/client.js";
import { isLiquidityFallbackEligible } from "../../../../src/services/defi/cross-chain/cross-chain-fallback.js";
import { mapLifiRouteToCrossChainOption } from "../../../../src/services/defi/cross-chain/cross-chain-lifi-adapter.js";
import type { CrossChainRouteOption as LifiCrossChainRouteOption } from "../../../../src/services/defi/lifi/lifi.types.js";
import type { SquidStoredRoutePayload } from "../../../../src/services/defi/squid/squid.types.js";

type RouterModule = typeof import("../../../../src/services/defi/cross-chain/cross-chain-router.service.js");
type FallbackServiceModule = typeof import("../../../../src/services/defi/cross-chain/cross-chain-fallback.service.js");
type FallbackCacheModule = typeof import("../../../../src/services/defi/cross-chain/cross-chain-fallback-cache.js");
type LifiCacheModule = typeof import("../../../../src/services/defi/lifi/lifi-cache.js");
type LifiNormalizeModule = typeof import("../../../../src/services/defi/lifi/lifi-normalize.js");
type SquidCacheModule = typeof import("../../../../src/services/defi/squid/squid-cache.js");

function sampleLifiRoute(routeId = "abc123def4567890"): LifiCrossChainRouteOption {
  const lifiRoute = {
    id: routeId,
    fromAmount: "1000000",
    toAmount: "990000",
    steps: [
      {
        tool: "stargate",
        estimate: { fromAmount: "1000000", toAmount: "990000", executionDuration: 120 },
        action: {
          fromChainId: 1,
          toChainId: 8453,
          fromToken: { symbol: "USDC" },
          toToken: { symbol: "USDC" },
        },
      },
    ],
  } as unknown as Route;

  return {
    route_id: routeId,
    provider_id: "evm-lifi",
    from_chain_id: "ethereum",
    to_chain_id: "ethereum",
    from_lifi_chain_id: 1,
    to_lifi_chain_id: 8453,
    from_evm_chain_id: 1,
    to_evm_chain_id: 8453,
    from_token_symbol: "USDC",
    to_token_symbol: "USDC",
    from_amount_atomic: "1000000",
    to_amount_atomic: "990000",
    bridges: ["stargate"],
    exchanges: [],
    estimated_duration_seconds: 120,
    gas_cost_usd: 1.2,
    fee_cost_usd: 0.5,
    tags: [],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    lifi_route: lifiRoute,
  };
}

const routesInput = {
  from_chain_id: "ethereum" as const,
  to_chain_id: "ethereum" as const,
  from_evm_chain_id: 1,
  to_evm_chain_id: 8453,
  from_token: "USDC",
  to_token: "USDC",
  amount_atomic: "1000000",
  confirm_same_token: true,
};

describe("cross-chain-fallback", () => {
  it("isLiquidityFallbackEligible: LIFI_NO_ROUTE yes", () => {
    const err = new AppError(404, "LIFI_NO_ROUTE", "No route");
    assert.equal(isLiquidityFallbackEligible(err), true);
    assert.equal(isLiquidityFallbackEligible(err, []), true);
  });

  it("isLiquidityFallbackEligible: LIFI_RATE_LIMITED no", () => {
    const err = new AppError(429, "LIFI_RATE_LIMITED", "Rate limited");
    assert.equal(isLiquidityFallbackEligible(err), false);
  });

  it("isLiquidityFallbackEligible: empty routes without error", () => {
    assert.equal(isLiquidityFallbackEligible(null, []), true);
  });

  it("isLiquidityFallbackEligible: non-empty routes are ineligible", () => {
    assert.equal(isLiquidityFallbackEligible(null, [{}]), false);
  });
});

describe("cross-chain-lifi-adapter", () => {
  it("mapLifiRouteToCrossChainOption adds lifi: prefix and provider_payload", () => {
    const mapped = mapLifiRouteToCrossChainOption(sampleLifiRoute());
    assert.equal(mapped.route_id, "lifi:abc123def4567890");
    assert.equal(mapped.provider_id, "evm-lifi");
    assert.equal(mapped.provider_payload.kind, "lifi");
    if (mapped.provider_payload.kind === "lifi") {
      assert.equal(mapped.provider_payload.from_lifi_chain_id, 1);
    }
  });
});

describe("cross-chain-router.service", () => {
  let router: RouterModule;
  let fallbackService: FallbackServiceModule;
  let fallbackCache: FallbackCacheModule;
  let lifiCache: LifiCacheModule;
  let lifiNormalize: LifiNormalizeModule;
  let squidCache: SquidCacheModule;
  let squidCalls = 0;

  before(async () => {
    [
      router,
      fallbackService,
      fallbackCache,
      lifiCache,
      lifiNormalize,
      squidCache,
    ] = await Promise.all([
      import("../../../../src/services/defi/cross-chain/cross-chain-router.service.js"),
      import("../../../../src/services/defi/cross-chain/cross-chain-fallback.service.js"),
      import("../../../../src/services/defi/cross-chain/cross-chain-fallback-cache.js"),
      import("../../../../src/services/defi/lifi/lifi-cache.js"),
      import("../../../../src/services/defi/lifi/lifi-normalize.js"),
      import("../../../../src/services/defi/squid/squid-cache.js"),
    ]);
  });

  after(async () => {
    const { resetLifiClientForTests } = await import("../../../../src/services/defi/lifi/lifi.client.js");
    const { resetSquidClientForTests } = await import("../../../../src/services/defi/squid/squid.client.js");
    setRedisClientForTests(undefined);
    resetLifiClientForTests();
    resetSquidClientForTests();
  });

  afterEach(() => {
    router.setGetLifiAdvancedRoutesForTests(null);
    fallbackService.setGetSquidRoutesForTests(null);
    clearMemoryCacheForTests();
    squidCalls = 0;
    delete process.env.SQUID_ENABLED;
    delete process.env.SQUID_INTEGRATOR_ID;
  });

  function enableSquidEnv(): void {
    process.env.SQUID_ENABLED = "true";
    process.env.SQUID_INTEGRATOR_ID = "radiant-test";
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "1,8453";
    process.env.EVM_CHAIN_IDS = "1,8453";
    process.env.EVM_RPC_URL_1 = "http://localhost:8545";
    process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  }

  it("Li-Fi returns routes → no fallback offer, routes mapped", async () => {
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [sampleLifiRoute()],
      unavailable_routes: null,
    }));

    const result = await router.getCrossChainRoutes("user-1", routesInput);
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0]?.route_id, "lifi:abc123def4567890");
    assert.equal(result.liquidity_fallback_offer, undefined);
    assert.deepEqual(result.routing, { primary: "evm-lifi" });
  });

  it("Li-Fi empty routes + Squid enabled → liquidity_fallback_offer, no Squid API call", async () => {
    enableSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [],
      unavailable_routes: [{ reason: "no liquidity" }],
    }));
    fallbackService.setGetSquidRoutesForTests(async () => {
      squidCalls += 1;
      return { routes: [], unavailable_routes: null };
    });

    const result = await router.getCrossChainRoutes("user-1", routesInput);
    assert.equal(result.routes.length, 0);
    assert.ok(result.liquidity_fallback_offer);
    assert.equal(result.liquidity_fallback_offer?.status, "offered");
    assert.equal(squidCalls, 0);
    assert.deepEqual(result.routing, { primary: "evm-lifi", fallback: "evm-squid" });
  });

  it("Li-Fi LIFI_NO_ROUTE error + Squid enabled → fallback offer without throwing", async () => {
    enableSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => {
      throw new AppError(404, "LIFI_NO_ROUTE", "No route found");
    });

    const result = await router.getCrossChainRoutes("user-1", routesInput);
    assert.equal(result.routes.length, 0);
    assert.ok(result.liquidity_fallback_offer);
    assert.equal(result.liquidity_fallback_offer?.primary_error_code, "LIFI_NO_ROUTE");
  });

  it("Li-Fi rate limited → rethrows without fallback offer", async () => {
    enableSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => {
      throw new AppError(429, "LIFI_RATE_LIMITED", "Rate limited");
    });

    await assert.rejects(
      () => router.getCrossChainRoutes("user-1", routesInput),
      (err: unknown) => err instanceof AppError && err.code === "LIFI_RATE_LIMITED",
    );
  });

  it("acceptLiquidityFallback returns squid routes and marks offer accepted", async () => {
    enableSquidEnv();
    const offer = await fallbackService.buildLiquidityFallbackOffer("user-1", routesInput);

    fallbackService.setGetSquidRoutesForTests(async () => {
      squidCalls += 1;
      return {
        routes: [
          {
            route_id: "squid:mock-route",
            provider_id: "evm-squid",
            from_chain_id: "ethereum",
            to_chain_id: "ethereum",
            from_evm_chain_id: 1,
            to_evm_chain_id: 8453,
            from_token_symbol: "USDC",
            to_token_symbol: "USDC",
            from_amount_atomic: "1000000",
            to_amount_atomic: "990000",
            bridges: ["squid"],
            exchanges: [],
            estimated_duration_seconds: 90,
            gas_cost_usd: null,
            fee_cost_usd: null,
            tags: [],
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            provider_payload: {
              kind: "squid",
              quote_id: "quote-1",
              from_squid_chain_id: "1",
              to_squid_chain_id: "8453",
              squid_route: { quoteId: "quote-1" },
            },
          },
        ],
        unavailable_routes: null,
      };
    });

    const accepted = await fallbackService.acceptLiquidityFallback("user-1", offer.fallback_offer_id);
    assert.equal(squidCalls, 1);
    assert.equal(accepted.routes.length, 1);
    assert.equal(accepted.routes[0]?.provider_id, "evm-squid");
    assert.deepEqual(accepted.routing, { primary: "evm-squid" });

    const stored = await fallbackCache.getLiquidityFallbackOffer(offer.fallback_offer_id);
    assert.equal(stored?.status, "accepted");
  });

  it("rejectLiquidityFallback marks rejected without Squid call", async () => {
    enableSquidEnv();
    const offer = await fallbackService.buildLiquidityFallbackOffer("user-1", routesInput);

    fallbackService.setGetSquidRoutesForTests(async () => {
      squidCalls += 1;
      return { routes: [], unavailable_routes: null };
    });

    const result = await fallbackService.rejectLiquidityFallback("user-1", offer.fallback_offer_id);
    assert.deepEqual(result, { status: "rejected" });
    assert.equal(squidCalls, 0);

    const stored = await fallbackCache.getLiquidityFallbackOffer(offer.fallback_offer_id);
    assert.equal(stored?.status, "rejected");
  });

  it("resolveCrossChainRouteForExecute dispatches by route_id prefix", async () => {
    const bareRouteId = "abc123def4567890";
    const lifiRoute = sampleLifiRoute(bareRouteId).lifi_route;
    await lifiCache.storeLifiRoute(bareRouteId, lifiRoute);

    const lifiResolved = await router.resolveCrossChainRouteForExecute({
      routeId: `lifi:${bareRouteId}`,
    });
    assert.equal(lifiResolved.provider_id, "evm-lifi");
    assert.ok(lifiNormalize.isExecutableLifiRoute(lifiResolved.route));

    const squidRouteId = "squid:resolve-test";
    const squidStored: SquidStoredRoutePayload = {
      route: {
        quoteId: "quote-resolve",
        params: {
          fromChain: "1",
          toChain: "8453",
          fromAmount: "1000000",
        },
      },
      quote_id: "quote-resolve",
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
      from_evm_chain_id: 1,
      to_evm_chain_id: 8453,
      from_squid_chain_id: "1",
      to_squid_chain_id: "8453",
    };
    await squidCache.storeSquidRoute(squidRouteId, squidStored);

    const squidResolved = await router.resolveCrossChainRouteForExecute({ routeId: squidRouteId });
    assert.equal(squidResolved.provider_id, "evm-squid");
    assert.equal(squidResolved.payload.quote_id, "quote-resolve");

    const legacyResolved = await router.resolveCrossChainRouteForExecute({ routeId: bareRouteId });
    assert.equal(legacyResolved.provider_id, "evm-lifi");
  });
});
