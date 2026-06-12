import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../src/config/chains.js";
import {
  balanceResultToWalletData,
  getBalanceForAddress,
  mistToSui,
} from "../../src/services/wallet/balance.service.js";
import { setAdapterForTests } from "../../src/services/chains/registry.js";
import { suiAdapter } from "../../src/services/chains/adapters/sui.js";
import type { ChainAdapter } from "../../src/services/chains/types.js";

describe("mistToSui", () => {
  it("converts mist to SUI", () => {
    assert.equal(mistToSui(1_000_000_000n), 1);
    assert.equal(mistToSui(0n), 0);
  });
});

describe("balance.service facade", () => {
  afterEach(() => {
    resetChainConfigCacheForTests();
    setAdapterForTests("sui", suiAdapter);
  });

  it("getBalanceForAddress delegates to registry adapter", async () => {
    const stub: ChainAdapter = {
      chainId: "sui",
      getBalance: async (address) => ({
        chain_id: "sui",
        address,
        balance_atomic: "1500000000",
        balance_display: 1.5,
        native_symbol: "SUI",
        coin_type: "0x2::sui::SUI",
        funded: true,
      }),
      executeTransaction: async () => {
        throw new Error("not implemented");
      },
    };

    setAdapterForTests("sui", stub);
    const result = await getBalanceForAddress("sui", "0x" + "a".repeat(64));
    assert.equal(result.balance_display, 1.5);
    assert.equal(result.funded, true);
  });

  it("balanceResultToWalletData maps canonical and legacy Sui fields", () => {
    const data = balanceResultToWalletData({
      chain_id: "sui",
      address: "0x" + "b".repeat(64),
      balance_atomic: "2000000000",
      balance_display: 2,
      native_symbol: "SUI",
      coin_type: "0x2::sui::SUI",
      funded: true,
    });

    assert.equal(data.chain_id, "sui");
    assert.equal(data.address, data.sui_address);
    assert.equal(data.balance_atomic, data.balance_mist);
    assert.equal(data.balance_display, data.balance_sui);
    assert.equal(data.native_symbol, "SUI");
  });
});
