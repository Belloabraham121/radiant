import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuoteRefreshParams } from "../../../../src/services/defi/lifi/lifi-quote.service.js";
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

    const params = buildQuoteRefreshParams(route, "0x0000000000000000000000000000000000000001");
    assert.equal(params.integrator, "radiant");
    assert.equal(params.fee, 0.001);
    delete process.env.LIFI_INTEGRATOR_FEE;
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
      fromToken: "USDC",
      toToken: "USDC",
      amountAtomic: "1000000",
    });

    assert.equal(tokens.from.chain_id, "sui");
    assert.equal(tokens.to.evm_chain_id, 42161);
  });
});
