import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import type { Route } from "@lifi/types";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import { clearMemoryCacheForTests } from "../../../src/infrastructure/redis/cache.js";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import { LIFI_QUERY_HANDLERS } from "../../../src/services/agent/chains/evm/lifi/query-handlers.js";
import type { CrossChainRouteOption as LifiCrossChainRouteOption } from "../../../src/services/defi/lifi/lifi.types.js";

type RouterModule = typeof import("../../../src/services/defi/cross-chain/cross-chain-router.service.js");
type FallbackServiceModule = typeof import("../../../src/services/defi/cross-chain/cross-chain-fallback.service.js");

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

const routesParams = {
  from_chain_id: "ethereum" as const,
  to_chain_id: "ethereum" as const,
  from_evm_chain_id: 1,
  to_evm_chain_id: 8453,
  from_token: "USDC",
  to_token: "USDC",
  amount_atomic: "1000000",
  confirm_same_token: true,
};

const handlerCtx = {
  privyUserId: "user-1",
  chainId: "ethereum" as const,
  walletAddress: "0xabc",
  query: "",
  params: routesParams,
};

describe("Li-Fi query handlers — cross-chain router wiring", () => {
  let router: RouterModule;
  let fallbackService: FallbackServiceModule;
  let lifiStatusCalls = 0;
  let squidStatusCalls = 0;

  before(async () => {
    [router, fallbackService] = await Promise.all([
      import("../../../src/services/defi/cross-chain/cross-chain-router.service.js"),
      import("../../../src/services/defi/cross-chain/cross-chain-fallback.service.js"),
    ]);
  });

  afterEach(() => {
    router.setGetLifiAdvancedRoutesForTests(null);
    router.setGetLifiCrossChainStatusForTests(null);
    router.setGetSquidCrossChainStatusForTests(null);
    fallbackService.setGetSquidRoutesForTests(null);
    clearMemoryCacheForTests();
    lifiStatusCalls = 0;
    squidStatusCalls = 0;
    delete process.env.SQUID_ENABLED;
    delete process.env.SQUID_INTEGRATOR_ID;
    delete process.env.LIFI_ENABLED;
  });

  function enableLifiAndSquidEnv(): void {
    process.env.LIFI_ENABLED = "true";
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
    setRedisClientForTests(undefined);
  }

  it("cross_chain_routes returns liquidity_fallback_offer when Li-Fi has no routes", async () => {
    enableLifiAndSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [],
      unavailable_routes: [{ reason: "no liquidity" }],
    }));

    const result = await LIFI_QUERY_HANDLERS.cross_chain_routes({
      ...handlerCtx,
      query: "cross_chain_routes",
    });

    assert.ok(result && typeof result === "object");
    assert.deepEqual((result as { routes: unknown[] }).routes, []);
    const offer = (result as { liquidity_fallback_offer?: { status: string } }).liquidity_fallback_offer;
    assert.equal(offer?.status, "offered");
    assert.ok(offer && "fallback_offer_id" in offer);
  });

  it("cross_chain_routes omits liquidity_fallback_offer when Li-Fi returns routes", async () => {
    enableLifiAndSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [sampleLifiRoute()],
      unavailable_routes: null,
    }));

    const result = await LIFI_QUERY_HANDLERS.cross_chain_routes({
      ...handlerCtx,
      query: "cross_chain_routes",
    });

    assert.equal((result as { routes: { route_id: string }[] }).routes.length, 1);
    assert.equal(
      (result as { routes: { route_id: string }[] }).routes[0]?.route_id,
      "lifi:abc123def4567890",
    );
    assert.equal(
      (result as { liquidity_fallback_offer?: unknown }).liquidity_fallback_offer,
      undefined,
    );
  });

  it("cross_chain_quote returns liquidity_fallback_offer when Li-Fi has no routes", async () => {
    enableLifiAndSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [],
      unavailable_routes: [{ reason: "no liquidity" }],
    }));

    const result = await LIFI_QUERY_HANDLERS.cross_chain_quote({
      ...handlerCtx,
      query: "cross_chain_quote",
    });

    const offer = (result as { liquidity_fallback_offer?: { status: string } }).liquidity_fallback_offer;
    assert.equal(offer?.status, "offered");
    assert.equal((result as { route_id?: string }).route_id, undefined);
  });

  it("cross_chain_quote returns CrossChainQuote shape when Li-Fi succeeds", async () => {
    enableLifiAndSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [sampleLifiRoute()],
      unavailable_routes: null,
    }));

    const result = await LIFI_QUERY_HANDLERS.cross_chain_quote({
      ...handlerCtx,
      query: "cross_chain_quote",
    });

    assert.equal((result as { route_id: string }).route_id, "abc123def4567890");
    assert.equal((result as { provider_id: string }).provider_id, "evm-lifi");
    assert.equal(
      (result as { liquidity_fallback_offer?: unknown }).liquidity_fallback_offer,
      undefined,
    );
  });

  it("cross_chain_status dispatches to Squid when provider_id is evm-squid", async () => {
    enableLifiAndSquidEnv();
    router.setGetSquidCrossChainStatusForTests(async () => {
      squidStatusCalls += 1;
      return {
        status: "PENDING",
        substatus: null,
        substatus_message: null,
        transaction_id: "tx-squid-1",
        quote_id: "quote-1",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
        receiving_tx_hash: null,
        raw: {},
      };
    });
    router.setGetLifiCrossChainStatusForTests(async () => {
      lifiStatusCalls += 1;
      throw new Error("Li-Fi status should not be called");
    });

    const result = await LIFI_QUERY_HANDLERS.cross_chain_status({
      ...handlerCtx,
      query: "cross_chain_status",
      params: {
        provider_id: "evm-squid",
        transaction_id: "tx-squid-1",
        quote_id: "quote-1",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
      },
    });

    assert.equal(squidStatusCalls, 1);
    assert.equal(lifiStatusCalls, 0);
    assert.equal((result as { transaction_id: string }).transaction_id, "tx-squid-1");
  });

  it("cross_chain_status dispatches to Li-Fi by default", async () => {
    enableLifiAndSquidEnv();
    router.setGetLifiCrossChainStatusForTests(async () => {
      lifiStatusCalls += 1;
      return {
        status: "DONE",
        substatus: null,
        substatus_message: null,
        tx_hash: "0xabc123",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_lifi_chain_id: 1,
        to_lifi_chain_id: 8453,
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
        receiving_tx_hash: "0xdef456",
        tool: "stargate",
        raw: {} as never,
      };
    });
    router.setGetSquidCrossChainStatusForTests(async () => {
      squidStatusCalls += 1;
      throw new Error("Squid status should not be called");
    });

    const result = await LIFI_QUERY_HANDLERS.cross_chain_status({
      ...handlerCtx,
      query: "cross_chain_status",
      params: {
        tx_hash: "0xabc123def4567890",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
      },
    });

    assert.equal(lifiStatusCalls, 1);
    assert.equal(squidStatusCalls, 0);
    assert.equal((result as { tx_hash: string }).tx_hash, "0xabc123");
  });
});
