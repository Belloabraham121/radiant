import assert from "node:assert/strict";
import { afterEach, describe, it, beforeEach } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { clearMemoryCacheForTests } from "../../../src/infrastructure/redis/cache.js";
import { buildDeFiApprovalPreview } from "../../../src/services/agent-transaction/approval-preview/build-preview.js";
import {
  enrichCrossChainExecuteInputForApproval,
} from "../../../src/services/agent-transaction/approval-preview/enrichers/cross-chain.js";
import { enrichSquidExecuteInputForApproval } from "../../../src/services/agent-transaction/approval-preview/enrichers/squid.js";
import {
  applySquidRouteToExecuteParams,
} from "../../../src/services/agent-transaction/approval-preview/enrichers/squid-route-params.js";
import * as fallbackService from "../../../src/services/defi/cross-chain/cross-chain-fallback.service.js";
import { setRequoteLifiFromSnapshotForTests } from "../../../src/services/defi/lifi/lifi-quote.service.js";
import { AppError } from "../../../src/errors/app-error.js";
import type { SquidRouteSnapshot } from "../../../src/services/defi/squid/squid.types.js";
import { storeSquidRoute } from "../../../src/services/defi/squid/squid-cache.js";

const mockSquidRoute = {
  quoteId: "quote-squid-test",
  params: {
    fromChain: "1",
    toChain: "8453",
    fromAmount: "1000000",
  },
  estimate: {
    fromAmount: "1000000",
    toAmount: "990000",
    gasCosts: [{ amountUsd: "1.20" }],
    feeCosts: [{ amountUsd: "0.30" }],
    actions: [{ provider: "squid" }],
  },
} as unknown as SquidRouteSnapshot;

function enableSquidEnv(): void {
  process.env.SQUID_ENABLED = "true";
  process.env.SQUID_INTEGRATOR_ID = "radiant-test";
  process.env.ENABLED_CHAINS = "ethereum,sui,solana";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
}

describe("approval preview — Squid / cross-chain", () => {
  beforeEach(() => {
    enableSquidEnv();
    clearMemoryCacheForTests();
  });

  afterEach(() => {
    fallbackService.setGetSquidRoutesForTests(null);
    setRequoteLifiFromSnapshotForTests(null);
    delete process.env.SQUID_ENABLED;
    delete process.env.SQUID_INTEGRATOR_ID;
    delete process.env.LIFI_ENABLED;
    delete process.env.LIFI_INTEGRATOR_ID;
  });

  it("applySquidRouteToExecuteParams maps route display fields", () => {
    const params = applySquidRouteToExecuteParams(
      { route_id: "squid:abc123" },
      mockSquidRoute,
      {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
        from_token_symbol: "USDC",
        to_token_symbol: "USDC",
        bridges: ["squid"],
      },
    );

    assert.equal(params.provider_id, "evm-squid");
    assert.equal(params.from_token_symbol, "USDC");
    assert.equal(params.to_amount_atomic, "990000");
    assert.equal(params.fee_cost_usd, 1.5);
    assert.ok(params.squid_route);
    assert.equal(typeof params.expires_at, "string");
  });

  it("enriches Squid execute params from stored route", async () => {
    const routeId = "squid:enrich-test";
    await storeSquidRoute(routeId, {
      route: mockSquidRoute,
      quote_id: "quote-squid-test",
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
      from_evm_chain_id: 1,
      to_evm_chain_id: 8453,
      from_squid_chain_id: "1",
      to_squid_chain_id: "8453",
    });

    const enriched = await enrichSquidExecuteInputForApproval("did:privy:test", {
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        route_id: routeId,
        provider_id: "evm-squid",
        from_token_symbol: "USDC",
        to_token_symbol: "USDC",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    assert.equal(enriched.params.provider_id, "evm-squid");
    assert.equal(enriched.params.from_amount_atomic, "1000000");
    assert.ok(enriched.params.squid_route);
  });

  it("cross-chain enricher dispatches Squid routes by route_id prefix", async () => {
    const routeId = "squid:dispatch-test";
    await storeSquidRoute(routeId, {
      route: mockSquidRoute,
      quote_id: "quote-squid-test",
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
      from_evm_chain_id: 1,
      to_evm_chain_id: 8453,
      from_squid_chain_id: "1",
      to_squid_chain_id: "8453",
    });

    const result = await enrichCrossChainExecuteInputForApproval("did:privy:test", {
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        route_id: routeId,
        from_token_symbol: "USDC",
        to_token_symbol: "USDC",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    assert.equal(result.kind, "enriched");
    assert.equal(result.input.params.provider_id, "evm-squid");
  });

  it("builds Squid bridge preview with alternate route badge", () => {
    const preview = buildDeFiApprovalPreview(
      {
        title: "Bridge USDC Ethereum → Base",
        amount_display: "1 USDC → ~0.99 USDC",
      },
      {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: {
          provider_id: "evm-squid",
          route_id: "squid:test",
          from_token_symbol: "USDC",
          to_token_symbol: "USDC",
          from_amount_display: "1",
          to_amount_display: "0.99",
          from_chain_id: "ethereum",
          to_chain_id: "ethereum",
          from_evm_chain_id: 1,
          to_evm_chain_id: 8453,
          fee_cost_usd: 1.5,
          quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      null,
    );

    assert.ok(preview);
    assert.equal(preview!.provider_id, "evm-squid");
    assert.equal(preview!.alternate_route, true);
    assert.equal(preview!.route_provider_label, "Alternate route");
    assert.equal(preview!.fee_cost_usd, 1.5);
  });

  it("LIFI_NO_ROUTE at enrich returns liquidity_fallback_offer when Squid enabled", async () => {
    setRequoteLifiFromSnapshotForTests(async (_privyUserId, _params, options) => {
      options?.onError?.(new AppError(404, "LIFI_NO_ROUTE", "No route"));
      return null;
    });

    const result = await enrichCrossChainExecuteInputForApproval("did:privy:test", {
      chain_id: "sui",
      action: "cross_chain_swap",
      params: {
        route_id: "lifi:missing-route",
        from_token: "SUI",
        to_token: "USDC",
        from_chain_id: "sui",
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_amount_atomic: "2150000000",
      },
    });

    assert.equal(result.kind, "liquidity_fallback_offered");
    if (result.kind === "liquidity_fallback_offered") {
      assert.equal(result.liquidity_fallback_offer.status, "offered");
      assert.ok(result.liquidity_fallback_offer.fallback_offer_id);
    }
  });

  it("does not offer liquidity fallback when Squid is disabled", async () => {
    delete process.env.SQUID_ENABLED;
    resetChainConfigCacheForTests();
    setRequoteLifiFromSnapshotForTests(async () => null);

    const result = await enrichCrossChainExecuteInputForApproval("did:privy:test", {
      chain_id: "sui",
      action: "cross_chain_swap",
      params: {
        route_id: "lifi:missing-route",
        from_token: "SUI",
        to_token: "USDC",
        from_chain_id: "sui",
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_amount_atomic: "2150000000",
        to_amount_atomic: "8500000",
      },
    });

    assert.equal(result.kind, "enriched");
    assert.equal(result.input.params.from_amount_display, "2.15");
    assert.equal(result.input.params.to_amount_display, "8.5");
    assert.equal(result.input.params.approval_outcome, undefined);
  });
});
