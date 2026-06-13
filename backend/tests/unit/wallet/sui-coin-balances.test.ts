import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  fetchSuiCoinBalances,
  resetSuiBalanceClientForTests,
  setSuiBalanceClientForTests,
} from "../../../src/services/wallet/sui-coin-balances.js";
import type { TokenCatalogEntry } from "../../../src/services/defi/deepbook/token-catalog.types.js";

const CATALOG: TokenCatalogEntry[] = [
  {
    symbol: "SUI",
    name: "Sui",
    coin_type: "0x2::sui::SUI",
    decimals: 9,
    popular: true,
  },
  {
    symbol: "USDC",
    name: "USDC",
    coin_type: "0xusdc::usdc::USDC",
    decimals: 6,
    popular: true,
  },
];

describe("fetchSuiCoinBalances", () => {
  afterEach(() => {
    resetSuiBalanceClientForTests();
  });

  it("returns zero balances for an empty wallet", async () => {
    setSuiBalanceClientForTests({
      getBalance: async () => ({ balance: { balance: "0" } }),
    });

    const rows = await fetchSuiCoinBalances("0x" + "a".repeat(64), CATALOG);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.balance_atomic, "0");
    assert.equal(rows[0]?.balance_display, 0);
  });

  it("returns partial holdings with correct decimals", async () => {
    setSuiBalanceClientForTests({
      getBalance: async ({ coinType }) => {
        if (coinType === "0x2::sui::SUI") {
          return { balance: { balance: "1500000000" } };
        }
        return { balance: { balance: "25000000" } };
      },
    });

    const rows = await fetchSuiCoinBalances("0x" + "b".repeat(64), CATALOG);
    const sui = rows.find((row) => row.symbol === "SUI");
    const usdc = rows.find((row) => row.symbol === "USDC");

    assert.equal(sui?.balance_display, 1.5);
    assert.equal(usdc?.balance_display, 25);
  });
});
