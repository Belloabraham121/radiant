import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSuiBalanceResult } from "../../../src/services/chains/adapters/sui-balance.js";
import { SUI_COIN_TYPE } from "../../../src/utils/sui-amount.js";
import { mistToSui } from "../../../src/utils/sui-amount.js";

const SUI_ADDRESS = `0x${"a".repeat(64)}`;

describe("sui adapter balance normalization", () => {
  it("maps ChainBalance to BalanceResult with SUI fields", () => {
    const mist = 2_500_000_000n;
    const result = toSuiBalanceResult({
      address: SUI_ADDRESS,
      balanceMist: mist,
      balanceSui: mistToSui(mist),
      funded: true,
      coinType: SUI_COIN_TYPE,
    });

    assert.equal(result.chain_id, "sui");
    assert.equal(result.address, SUI_ADDRESS);
    assert.equal(result.balance_atomic, "2500000000");
    assert.equal(result.balance_display, 2.5);
    assert.equal(result.native_symbol, "SUI");
    assert.equal(result.coin_type, SUI_COIN_TYPE);
    assert.equal(result.funded, true);
  });

  it("marks zero mist as not funded", () => {
    const result = toSuiBalanceResult({
      address: SUI_ADDRESS,
      balanceMist: 0n,
      balanceSui: 0,
      funded: false,
      coinType: SUI_COIN_TYPE,
    });

    assert.equal(result.balance_atomic, "0");
    assert.equal(result.balance_display, 0);
    assert.equal(result.funded, false);
  });

  it("keeps balance_atomic as a decimal string for large values", () => {
    const mist = 9_999_999_999_999n;
    const result = toSuiBalanceResult({
      address: SUI_ADDRESS,
      balanceMist: mist,
      balanceSui: mistToSui(mist),
      funded: true,
      coinType: SUI_COIN_TYPE,
    });

    assert.equal(result.balance_atomic, mist.toString());
    assert.equal(result.balance_display, mistToSui(mist));
  });
});
