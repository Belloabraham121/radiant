import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import {
  SQUID_NATIVE_EVM_TOKEN_ADDRESS,
  radiantToSquidChainId,
  squidToRadiantChainRef,
  toSquidTokenAddress,
} from "../../../../src/services/defi/squid/squid-chain-map.js";
import { resolveSquidTokens } from "../../../../src/services/defi/squid/squid-input.js";

describe("squid-chain-map", () => {
  beforeEach(() => {
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
  });

  it("round-trips EVM, Sui, and Solana chain refs", () => {
    assert.equal(radiantToSquidChainId({ chain_id: "sui" }), "sui-mainnet");
    assert.equal(radiantToSquidChainId({ chain_id: "solana" }), "solana-mainnet-beta");
    assert.equal(radiantToSquidChainId({ chain_id: "ethereum", evm_chain_id: 42161 }), "42161");

    assert.deepEqual(squidToRadiantChainRef("sui-mainnet"), { chain_id: "sui" });
    assert.deepEqual(squidToRadiantChainRef("solana-mainnet-beta"), { chain_id: "solana" });
    assert.deepEqual(squidToRadiantChainRef("8453"), {
      chain_id: "ethereum",
      evm_chain_id: 8453,
    });
  });

  it("maps native ETH to Squid sentinel address", () => {
    const tokens = resolveSquidTokens({
      from_chain_id: "ethereum",
      from_evm_chain_id: 1,
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "ETH",
      toToken: "USDC",
      amountAtomic: "1000000000000000000",
    });
    const address = toSquidTokenAddress(tokens.fromToken, tokens.from);
    assert.equal(address, SQUID_NATIVE_EVM_TOKEN_ADDRESS);
  });
});
