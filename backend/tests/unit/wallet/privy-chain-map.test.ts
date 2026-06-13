import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { evmChainIdToPrivyChain } from "../../../src/services/wallet/privy-chain-map.js";

describe("evmChainIdToPrivyChain", () => {
  afterEach(() => {
    resetEvmConfigCacheForTests();
  });

  it("maps Ethereum mainnet to privy ethereum", () => {
    assert.equal(evmChainIdToPrivyChain(1), "ethereum");
  });

  it("maps Base to privy base", () => {
    assert.equal(evmChainIdToPrivyChain(8453), "base");
  });

});
