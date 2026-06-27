import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Route } from "@lifi/types";
import { isSameChainEvmLifiRoute } from "../../../../src/services/defi/lifi/lifi-same-chain-execute.service.js";

function routeWithChains(fromChainId: number, toChainId: number): Route {
  return {
    id: "route-1",
    fromChainId,
    toChainId,
    fromAmount: "1",
    toAmount: "1",
    steps: [
      {
        id: "step-1",
        type: "swap",
        tool: "kyberswap",
        action: {
          fromChainId,
          toChainId,
          fromToken: { address: "0xusdc", chainId: fromChainId, symbol: "USDC", decimals: 6 },
          toToken: { address: "0xeth", chainId: toChainId, symbol: "ETH", decimals: 18 },
          fromAmount: "1",
          toAmount: "1",
        },
        estimate: {},
      } as Route["steps"][number],
    ],
  } as Route;
}

function routeWithMixedSteps(evmChainId: number, detourChainId: number): Route {
  const baseStep = routeWithChains(evmChainId, evmChainId).steps[0];
  return {
    ...routeWithChains(evmChainId, evmChainId),
    steps: [
      { ...baseStep, action: { ...baseStep.action, fromChainId: evmChainId, toChainId: evmChainId } },
      {
        ...baseStep,
        id: "step-2",
        action: {
          ...baseStep.action,
          fromChainId: evmChainId,
          toChainId: detourChainId,
        },
      },
      { ...baseStep, id: "step-3", action: { ...baseStep.action, fromChainId: detourChainId, toChainId: evmChainId } },
    ],
  } as Route;
}

describe("lifi-same-chain-execute", () => {
  it("detects same-chain EVM routes", () => {
    const route = routeWithChains(8453, 8453);
    assert.equal(
      isSameChainEvmLifiRoute({ chain_id: "ethereum", evm_chain_id: 8453 }, route),
      true,
    );
    assert.equal(
      isSameChainEvmLifiRoute({ chain_id: "ethereum", evm_chain_id: 1 }, route),
      false,
    );
  });

  it("rejects cross-chain routes", () => {
    const route = routeWithChains(8453, 1);
    assert.equal(
      isSameChainEvmLifiRoute({ chain_id: "ethereum", evm_chain_id: 8453 }, route),
      false,
    );
  });

  it("rejects routes that leave and return to the same EVM chain", () => {
    const route = routeWithMixedSteps(8453, 1);
    assert.equal(
      isSameChainEvmLifiRoute({ chain_id: "ethereum", evm_chain_id: 8453 }, route),
      false,
    );
  });
});
