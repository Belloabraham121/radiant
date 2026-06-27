import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import type { Route } from "@lifi/types";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import { clearMemoryCacheForTests } from "../../../src/infrastructure/redis/cache.js";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import {
  executeResolvedBridgeIntent,
} from "../../../src/services/agent/bridge/bridge-execute.js";
import { LIQUIDITY_FALLBACK_BRIDGE_REPLY } from "../../../src/services/agent/cross-chain-intent-helpers.js";
import type { PartialBridgeIntent } from "../../../src/services/agent/bridge/bridge-intent.types.js";
import {
  setCreateLiquidityFallbackPendingForTests,
} from "../../../src/services/agent/transaction-approval.service.js";
import {
  setExecuteTransactionWithApprovalHandlerForTests,
} from "../../../src/services/agent/execute-transaction-with-approval.js";

type RouterModule = typeof import("../../../src/services/defi/cross-chain/cross-chain-router.service.js");
type LifiCrossChainRouteOption = import("../../../src/services/defi/lifi/lifi.types.js").CrossChainRouteOption;

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

const bridgeIntent: PartialBridgeIntent = {
  originalMessage: "bridge 100 USDC from ethereum to base",
  amount: 100,
  fromToken: "USDC",
  toToken: "USDC",
  fromChainId: "ethereum",
  fromEvmChainId: 1,
  toChainId: "ethereum",
  toEvmChainId: 8453,
  confirmSameToken: true,
};

describe("bridge-execute — cross-chain router fallback", () => {
  let router: RouterModule;

  before(async () => {
    router = await import("../../../src/services/defi/cross-chain/cross-chain-router.service.js");
  });

  afterEach(() => {
    router.setGetLifiAdvancedRoutesForTests(null);
    setExecuteTransactionWithApprovalHandlerForTests(null);
    setCreateLiquidityFallbackPendingForTests(null);
    clearMemoryCacheForTests();
    delete process.env.SQUID_ENABLED;
    delete process.env.SQUID_INTEGRATOR_ID;
    delete process.env.LIFI_ENABLED;
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_CHAIN_IDS;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
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

  it("returns liquidity fallback offer when Li-Fi has no routes", async () => {
    enableLifiAndSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [],
      unavailable_routes: [{ reason: "no liquidity" }],
    }));

    let capturedOfferId: string | undefined;
    setCreateLiquidityFallbackPendingForTests(async (_privy, _input, offer) => ({
      id: "pending-fallback-1",
      chain_id: offer.from_chain_id,
      action: "cross_chain_swap",
      params: {},
      summary: `Alternate route available for ${offer.from_token} → ${offer.to_token}`,
      amount_display: `${offer.from_token} → ${offer.to_token}`,
      quote_expires_at: offer.expires_at,
      approval_outcome: "liquidity_fallback_offered",
      liquidity_fallback_offer: offer,
    }));

    const outcome = await executeResolvedBridgeIntent("user-1", bridgeIntent, "session-1");
    assert.ok(outcome);
    assert.equal(outcome!.reply, LIQUIDITY_FALLBACK_BRIDGE_REPLY);
    assert.doesNotMatch(outcome!.reply, /No bridge routes are available/i);

    const routesCall = outcome!.tool_calls.find(
      (call) => call.query === "cross_chain_routes",
    );
    assert.ok(routesCall);
    const routesResult = routesCall!.result as {
      routes: unknown[];
      liquidity_fallback_offer?: { fallback_offer_id: string; status: string };
    };
    assert.deepEqual(routesResult.routes, []);
    assert.equal(routesResult.liquidity_fallback_offer?.status, "offered");
    capturedOfferId = routesResult.liquidity_fallback_offer?.fallback_offer_id;
    assert.ok(capturedOfferId);

    assert.ok(outcome!.pending_transaction);
    assert.equal(outcome!.pending_transaction!.approval_outcome, "liquidity_fallback_offered");
    assert.equal(
      outcome!.pending_transaction!.liquidity_fallback_offer?.fallback_offer_id,
      capturedOfferId,
    );
  });

  it("returns approval_required when Li-Fi returns a route", async () => {
    enableLifiAndSquidEnv();
    router.setGetLifiAdvancedRoutesForTests(async () => ({
      routes: [sampleLifiRoute()],
      unavailable_routes: null,
    }));

    let capturedRouteId: string | undefined;
    setExecuteTransactionWithApprovalHandlerForTests(async (_privy, input) => {
      capturedRouteId = input.params.route_id as string | undefined;
      return {
        status: "approval_required",
        pending: {
          id: "pending-bridge-1",
          chain_id: input.chain_id,
          action: input.action,
          params: input.params,
          summary: "Bridge USDC → USDC",
          amount_display: "100 USDC",
        },
      };
    });

    const outcome = await executeResolvedBridgeIntent("user-1", bridgeIntent, "session-1");
    assert.ok(outcome);
    assert.match(outcome!.reply, /approval/i);
    assert.equal(outcome!.pending_transaction?.id, "pending-bridge-1");
    assert.equal(capturedRouteId, "lifi:abc123def4567890");

    const executeCall = outcome!.tool_calls.find(
      (call) => call.name === "execute_transaction",
    );
    assert.ok(executeCall);
    const executeResult = executeCall!.result as { status: string };
    assert.equal(executeResult.status, "approval_required");
  });
});
