import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SquidRouteResponse } from "../../../../src/services/defi/squid/squid.types.js";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import {
  createSquidRouteId,
  normalizeSquidRouteOption,
} from "../../../../src/services/defi/squid/squid-normalize.js";

function enableEthereumChains(): void {
  process.env.ENABLED_CHAINS = "ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
}

const mockResponse = {
  route: {
    quoteId: "quote-abc",
    estimate: {
      fromAmount: "1000000",
      toAmount: "999000",
      estimatedRouteDuration: 180,
      gasCosts: [{ amountUsd: "1.50" }],
      feeCosts: [{ amountUsd: "0.25" }],
      actions: [{ provider: "axelar" }],
    },
    params: {
      fromAmount: "1000000",
    },
  },
  requestId: "req-123",
} as unknown as SquidRouteResponse;

describe("squid-normalize", () => {
  it("normalizes Squid route to CrossChainRouteOption with squid: prefix", () => {
    enableEthereumChains();
    const option = normalizeSquidRouteOption({
      response: mockResponse,
      from: { chain_id: "ethereum", evm_chain_id: 1 },
      to: { chain_id: "ethereum", evm_chain_id: 8453 },
      fromTokenSymbol: "USDC",
      toTokenSymbol: "USDC",
      routeId: "squid:deadbeefcafebabe",
    });

    assert.equal(option.provider_id, "evm-squid");
    assert.equal(option.route_id, "squid:deadbeefcafebabe");
    assert.equal(option.from_amount_atomic, "1000000");
    assert.equal(option.to_amount_atomic, "999000");
    assert.equal(option.from_chain_id, "ethereum");
    assert.equal(option.to_chain_id, "ethereum");
    assert.deepEqual(option.bridges, ["axelar"]);
    assert.equal(option.provider_payload.kind, "squid");
    if (option.provider_payload.kind === "squid") {
      assert.equal(option.provider_payload.quote_id, "quote-abc");
      assert.equal(option.provider_payload.from_squid_chain_id, "1");
      assert.equal(option.provider_payload.to_squid_chain_id, "8453");
    }
    assert.equal(option.estimated_duration_seconds, 180);
    assert.equal(option.gas_cost_usd, 1.5);
    assert.equal(option.fee_cost_usd, 0.25);
  });

  it("createSquidRouteId prefixes squid:", () => {
    const id = createSquidRouteId("seed");
    assert.match(id, /^squid:[a-f0-9]{16}$/);
  });
});
