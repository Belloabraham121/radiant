import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LiFiStep, Route } from "@lifi/types";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import {
  normalizeLifiRouteOption,
  normalizeLifiStepToCrossChainQuote,
} from "../../../../src/services/defi/lifi/lifi-normalize.js";

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

const mockStep = {
  id: "step-1",
  type: "lifi",
  tool: "stargate",
  action: {
    fromChainId: 1,
    toChainId: 8453,
    fromToken: { chainId: 1, address: "0x1", symbol: "USDC", decimals: 6, name: "USDC", priceUSD: "1" },
    toToken: { chainId: 8453, address: "0x2", symbol: "USDC", decimals: 6, name: "USDC", priceUSD: "1" },
    fromAmount: "1000000",
    toAmount: "999000",
    slippage: 0.005,
  },
  estimate: {
    fromAmount: "1000000",
    toAmount: "999000",
    executionDuration: 120,
    gasCosts: [{ amountUSD: "1.50" }],
    feeCosts: [{ amountUSD: "0.25" }],
  },
  transactionRequest: {
    chainId: 1,
    to: "0xbridge",
    from: "0xwallet",
    data: "0xabc",
    value: "0",
  },
} as unknown as LiFiStep;

describe("lifi-normalize", () => {
  it("normalizes LiFi step to CrossChainQuote", () => {
    enableEthereumChains();
    const quote = normalizeLifiStepToCrossChainQuote({
      step: mockStep,
      from: { chain_id: "ethereum", evm_chain_id: 1 },
      to: { chain_id: "ethereum", evm_chain_id: 8453 },
      fromTokenSymbol: "USDC",
      toTokenSymbol: "USDC",
      routeId: "route123",
    });

    assert.equal(quote.provider_id, "evm-lifi");
    assert.equal(quote.from_amount_atomic, "1000000");
    assert.equal(quote.route_id, "route123");
    assert.equal(quote.from_chain_id, "ethereum");
    assert.equal(quote.to_chain_id, "ethereum");
    assert.deepEqual(quote.bridges, ["stargate"]);
    assert.equal(quote.transaction_request?.chain_id, 1);
  });

  it("normalizes route option for multi-bridge comparison", () => {
    enableEthereumChains();
    const route = {
      id: "r1",
      fromChainId: 1,
      toChainId: 42161,
      fromAmount: "1000000",
      toAmount: "990000",
      steps: [mockStep],
      tags: ["RECOMMENDED"],
    } as unknown as Route;

    const option = normalizeLifiRouteOption({
      route,
      from: { chain_id: "ethereum", evm_chain_id: 1 },
      to: { chain_id: "ethereum", evm_chain_id: 42161 },
      fromTokenSymbol: "USDC",
      toTokenSymbol: "USDC",
    });

    assert.equal(option.route_id, "r1");
    assert.ok(option.bridges.includes("stargate"));
    assert.deepEqual(option.tags, ["RECOMMENDED"]);
  });
});
