import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQuoteRefreshParams,
  resolveLifiRouteForExecute,
} from "../../../../src/services/defi/lifi/lifi-quote.service.js";
import { isExecutableLifiRoute } from "../../../../src/services/defi/lifi/lifi-normalize.js";
import { resolveLifiTokens } from "../../../../src/services/defi/lifi/lifi-input.js";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import type { Route } from "@lifi/types";

describe("lifi-quote.service", () => {
  it("buildQuoteRefreshParams includes integrator fee for execute re-quote", () => {
    process.env.LIFI_INTEGRATOR_FEE = "0.001";
    const route = {
      fromAmount: "1000000",
      toAddress: "0x00000000000000000000000000000000000000ab",
      steps: [
        {
          action: {
            fromChainId: 8453,
            toChainId: 1,
            fromToken: { address: "0xfrom" },
            toToken: { address: "0xto" },
          },
        },
      ],
    } as unknown as Route;

    const params = buildQuoteRefreshParams(
      route,
      "0x0000000000000000000000000000000000000001",
      "0x00000000000000000000000000000000000000ab",
    );
    assert.equal(params.integrator, "radiant");
    assert.equal(params.fee, 0.001);
    assert.equal(params.toAddress, "0x00000000000000000000000000000000000000ab");
    delete process.env.LIFI_INTEGRATOR_FEE;
  });

  it("buildQuoteRefreshParams uses route-level endpoints for multi-step routes", () => {
    // First step is an intra-Sui swap; the bridge to Base happens in a later
    // step. Refresh must re-quote Sui→Base, not Sui→Sui.
    const route = {
      fromChainId: 9270000000000000,
      toChainId: 8453,
      fromToken: { address: "0x2::sui::SUI" },
      toToken: { address: "0x833589fcd6edb6e08f4c7c32d4f597b90bea844e" },
      fromAmount: "2150000000",
      toAddress: "0x00000000000000000000000000000000000000ab",
      steps: [
        {
          action: {
            fromChainId: 9270000000000000,
            toChainId: 9270000000000000,
            fromToken: { address: "0x2::sui::SUI" },
            toToken: { address: "0xusdc::sui" },
          },
        },
        {
          action: {
            fromChainId: 9270000000000000,
            toChainId: 8453,
            fromToken: { address: "0xusdc::sui" },
            toToken: { address: "0x833589fcd6edb6e08f4c7c32d4f597b90bea844e" },
            toAddress: "0x00000000000000000000000000000000000000ab",
          },
        },
      ],
    } as unknown as Route;

    const params = buildQuoteRefreshParams(
      route,
      "0x0000000000000000000000000000000000000001",
    );
    assert.equal(params.fromChain, 9270000000000000);
    assert.equal(params.toChain, 8453);
    assert.equal(params.fromToken, "0x2::sui::SUI");
    assert.equal(params.toToken, "0x833589fcd6edb6e08f4c7c32d4f597b90bea844e");
    assert.equal(params.toAddress, "0x00000000000000000000000000000000000000ab");
  });

  it("isExecutableLifiRoute rejects routes without usable steps", () => {
    assert.equal(isExecutableLifiRoute(undefined), false);
    assert.equal(isExecutableLifiRoute({}), false);
    assert.equal(isExecutableLifiRoute({ steps: [] }), false);
    assert.equal(isExecutableLifiRoute({ steps: [{}] }), false);
    assert.equal(isExecutableLifiRoute({ steps: [{ action: {} }] }), true);
  });

  it("resolveLifiRouteForExecute rejects a malformed embedded route cleanly", async () => {
    // An agent-supplied lifi_route missing `steps` must surface a clean
    // LIFI_NO_ROUTE error, not a raw "Cannot read properties of undefined".
    await assert.rejects(
      resolveLifiRouteForExecute({ lifiRoute: { id: "abc" } }),
      (err: unknown) =>
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "LIFI_NO_ROUTE",
    );
  });

  it("resolveLifiTokens accepts allowlisted USDC on Base", () => {
    process.env.ENABLED_CHAINS = "sui,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    process.env.EVM_RPC_URL_1 = "http://localhost:8545";
    process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
    process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();

    const tokens = resolveLifiTokens({
      from_evm_chain_id: 8453,
      to_evm_chain_id: 1,
      fromToken: "USDC",
      toToken: "USDC",
      amountAtomic: "1000000",
    });

    assert.equal(tokens.fromSymbol, "USDC");
    assert.equal(tokens.toSymbol, "USDC");
  });

  it("resolveLifiTokens accepts Sui to Arbitrum via chain ids", () => {
    process.env.ENABLED_CHAINS = "sui,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "42161,8453";
    process.env.EVM_CHAIN_IDS = "42161,8453";
    process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
    process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();

    const tokens = resolveLifiTokens({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      to_evm_chain_id: 42161,
      fromToken: "SUI",
      toToken: "USDC",
      amountAtomic: "1000000",
    });

    assert.equal(tokens.from.chain_id, "sui");
    assert.equal(tokens.to.evm_chain_id, 42161);
  });
});
