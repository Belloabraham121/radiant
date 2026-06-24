import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLifiTokens } from "../../../../src/services/defi/lifi/lifi-input.js";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";

describe("lifi-quote.service", () => {
  it("resolveLifiTokens accepts allowlisted USDC on Base", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    process.env.EVM_RPC_URL_1 = "http://localhost:8545";
    process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
    process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();

    const tokens = resolveLifiTokens({
      fromEvmChainId: 8453,
      toEvmChainId: 1,
      fromToken: "USDC",
      toToken: "USDC",
    });

    assert.equal(tokens.fromSymbol, "USDC");
    assert.equal(tokens.toSymbol, "USDC");
  });
});
