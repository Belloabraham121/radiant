import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toEvmBalanceResult } from "../../../src/services/chains/adapters/evm-balance.js";
import { weiToEth } from "../../../src/utils/evm-amount.js";

describe("evm adapter balance normalization", () => {
  it("maps wei balance to BalanceResult with EVM fields", () => {
    const result = toEvmBalanceResult({
      address: "0x" + "a".repeat(40),
      evmChainId: 8453,
      balanceWei: 1_500_000_000_000_000_000n,
      balanceEth: 1.5,
      funded: true,
    });

    assert.equal(result.chain_id, "ethereum");
    assert.equal(result.native_symbol, "ETH");
    assert.equal(result.balance_atomic, "1500000000000000000");
    assert.equal(result.balance_display, 1.5);
    assert.equal(result.evm_chain_id, 8453);
    assert.equal(result.funded, true);
  });

  it("marks zero wei as not funded", () => {
    const result = toEvmBalanceResult({
      address: "0x" + "b".repeat(40),
      evmChainId: 1,
      balanceWei: 0n,
      balanceEth: 0,
      funded: false,
    });

    assert.equal(result.funded, false);
    assert.equal(result.balance_atomic, "0");
  });
});

describe("weiToEth", () => {
  it("converts wei to ETH", () => {
    assert.equal(weiToEth(1_000_000_000_000_000_000n), 1);
    assert.equal(weiToEth(0n), 0);
  });
});
