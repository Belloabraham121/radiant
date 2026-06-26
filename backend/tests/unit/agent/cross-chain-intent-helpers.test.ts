import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CrossChainRouteOption } from "../../../src/services/defi/cross-chain/cross-chain.types.js";
import {
  crossChainRouteHasFeeCollection,
  crossChainRouteNeedsSourceSwap,
  isSmallCrossChainUsdAmount,
  pickBestCrossChainRoute,
} from "../../../src/services/agent/cross-chain-intent-helpers.js";

function route(overrides: Partial<CrossChainRouteOption> = {}): CrossChainRouteOption {
  return {
    route_id: "lifi:test",
    provider_id: "evm-lifi",
    from_chain_id: "ethereum",
    to_chain_id: "sui",
    from_evm_chain_id: 8453,
    from_token_symbol: "ETH",
    to_token_symbol: "SUI",
    from_amount_atomic: "1",
    to_amount_atomic: "1",
    bridges: ["mayanMCTP"],
    exchanges: [],
    estimated_duration_seconds: 60,
    gas_cost_usd: 0.01,
    fee_cost_usd: 0.01,
    tags: [],
    expires_at: new Date().toISOString(),
    provider_payload: {
      kind: "lifi",
      lifi_route: { id: "r", steps: [] } as CrossChainRouteOption["provider_payload"] extends {
        kind: "lifi";
        lifi_route: infer R;
      }
        ? R
        : never,
      from_lifi_chain_id: 8453,
      to_lifi_chain_id: 101,
    },
    ...overrides,
  };
}

describe("pickBestCrossChainRoute", () => {
  it("prefers direct routes for small USD transfers when available", () => {
    const swapRoute = route({
      route_id: "lifi:swap",
      exchanges: ["sushiswap"],
      gas_cost_usd: 0.005,
      fee_cost_usd: 0.005,
    });
    const directRoute = route({
      route_id: "lifi:direct",
      exchanges: [],
      gas_cost_usd: 0.02,
      fee_cost_usd: 0.02,
    });

    const picked = pickBestCrossChainRoute([swapRoute, directRoute], {
      preferDirectRoutes: true,
    });
    assert.equal(picked?.route_id, "lifi:direct");
  });

  it("falls back to swap routes when no direct route exists", () => {
    const swapRoute = route({ route_id: "lifi:swap", exchanges: ["sushiswap"] });
    const picked = pickBestCrossChainRoute([swapRoute], { preferDirectRoutes: true });
    assert.equal(picked?.route_id, "lifi:swap");
  });
});

describe("small cross-chain helpers", () => {
  it("flags small USD amounts", () => {
    assert.equal(isSmallCrossChainUsdAmount(1.5), true);
    assert.equal(isSmallCrossChainUsdAmount(10), false);
    assert.equal(isSmallCrossChainUsdAmount(undefined), false);
  });

  it("detects source swap routes", () => {
    assert.equal(crossChainRouteNeedsSourceSwap(route({ exchanges: ["sushiswap"] })), true);
    assert.equal(crossChainRouteNeedsSourceSwap(route({ exchanges: ["feeCollection"] })), false);
    assert.equal(crossChainRouteNeedsSourceSwap(route()), false);
  });

  it("detects feeCollection routes", () => {
    assert.equal(crossChainRouteHasFeeCollection(route({ exchanges: ["feeCollection", "fly"] })), true);
    assert.equal(crossChainRouteHasFeeCollection(route({ exchanges: ["kyberswap"] })), false);
  });
});
