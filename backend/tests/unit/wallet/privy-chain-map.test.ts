import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { evmChainIdToPrivyChain } from "../../../src/services/wallet/privy-chain-map.js";

describe("evmChainIdToPrivyChain", () => {
  afterEach(() => {
    delete process.env.EVM_CHAIN_IDS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    resetEvmConfigCacheForTests();
  });

  it("maps Ethereum mainnet to privy ethereum", () => {
    assert.equal(evmChainIdToPrivyChain(1), "ethereum");
  });

  it("maps Base to privy base", () => {
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetEvmConfigCacheForTests();
    assert.equal(evmChainIdToPrivyChain(8453), "base");
  });
});
