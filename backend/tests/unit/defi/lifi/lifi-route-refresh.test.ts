import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Route } from "@lifi/types";
import { routeNeedsStepTransactionRefresh } from "../../../../src/services/defi/lifi/lifi-quote.service.js";

function minimalRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: "test",
    fromChainId: 8453,
    toChainId: 101,
    fromAmount: "1000",
    toAmount: "900",
    steps: [
      {
        id: "step-1",
        type: "lifi",
        tool: "mayanMCTP",
        action: {
          fromChainId: 8453,
          toChainId: 101,
          fromToken: { address: "0x0", symbol: "ETH", decimals: 18, chainId: 8453, name: "ETH" },
          toToken: { address: "0x1", symbol: "SUI", decimals: 9, chainId: 101, name: "SUI" },
          fromAmount: "1000",
          toAmount: "900",
          fromAddress: "0xfrom",
          toAddress: "0xto",
        },
        estimate: { fromAmount: "1000", toAmount: "900", executionDuration: 60 },
      },
    ],
    ...overrides,
  } as Route;
}

describe("routeNeedsStepTransactionRefresh", () => {
  it("returns true when route has includedSteps from getRoutes", () => {
    const route = minimalRoute({
      steps: [
        {
          ...minimalRoute().steps[0],
          includedSteps: [
            { tool: "feeCollection" },
            { tool: "sushiswap" },
          ],
        } as Route["steps"][number],
      ],
    });
    assert.equal(routeNeedsStepTransactionRefresh(route), true);
  });

  it("returns true for multi-step routes", () => {
    const route = minimalRoute({
      steps: [minimalRoute().steps[0], minimalRoute().steps[0]],
    });
    assert.equal(routeNeedsStepTransactionRefresh(route), true);
  });

  it("returns false for single-step getQuote routes with tx data", () => {
    const route = minimalRoute({
      steps: [
        {
          ...minimalRoute().steps[0],
          transactionRequest: {
            to: "0xdiamond",
            from: "0xfrom",
            chainId: 8453,
            data: "0x",
            value: "1000",
          },
        } as Route["steps"][number],
      ],
    });
    assert.equal(routeNeedsStepTransactionRefresh(route), false);
  });
});
