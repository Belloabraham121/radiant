import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { PrivyBalanceGetResponse } from "../../../src/services/wallet/privy-balance.types.js";
import {
  fetchEvmPrivyWalletAssets,
  fetchSolanaPrivyWalletAssets,
  setPrivyBalanceGetForTests,
} from "../../../src/services/wallet/privy-balance.service.js";

const EVM_RESPONSE: PrivyBalanceGetResponse = {
  balances: [
    {
      asset: "eth",
      chain: "ethereum",
      raw_value: "1000000000000000000",
      raw_value_decimals: 18,
      display_values: { eth: "1.0", usd: "3200.00" },
    },
    {
      asset: "usdc",
      chain: "ethereum",
      raw_value: "5000000",
      raw_value_decimals: 6,
      display_values: { usdc: "5.0", usd: "5.00" },
    },
  ],
};

const SOLANA_RESPONSE: PrivyBalanceGetResponse = {
  balances: [
    {
      asset: "sol",
      chain: "solana",
      raw_value: "2000000000",
      raw_value_decimals: 9,
      display_values: { sol: "2.0", usd: "300.00" },
    },
  ],
};

describe("privy-balance.service", () => {
  afterEach(() => {
    setPrivyBalanceGetForTests(null);
  });

  it("maps EVM named assets with USD values", async () => {
    setPrivyBalanceGetForTests(async () => EVM_RESPONSE);

    const { assets, evmChainId } = await fetchEvmPrivyWalletAssets("wallet-evm-1", {
      evmChainId: 1,
      includeUsd: true,
    });

    assert.equal(evmChainId, 1);
    assert.equal(assets.length, 3);
    const eth = assets.find((row) => row.symbol === "ETH");
    const usdc = assets.find((row) => row.symbol === "USDC");
    const usdt = assets.find((row) => row.symbol === "USDT");

    assert.equal(eth?.balance_display, 1);
    assert.equal(eth?.usd_value, 3200);
    assert.equal(eth?.source, "privy");
    assert.equal(usdc?.balance_display, 5);
    assert.equal(usdc?.usd_value, 5);
    assert.equal(usdt?.balance_atomic, "0");
    assert.equal(usdt?.balance_display, 0);
  });

  it("maps Solana SOL and zero USDC", async () => {
    setPrivyBalanceGetForTests(async () => SOLANA_RESPONSE);

    const assets = await fetchSolanaPrivyWalletAssets("wallet-sol-1", { includeUsd: true });
    const sol = assets.find((row) => row.symbol === "SOL");
    const usdc = assets.find((row) => row.symbol === "USDC");

    assert.equal(sol?.balance_display, 2);
    assert.equal(sol?.usd_value, 300);
    assert.equal(usdc?.balance_atomic, "0");
    assert.equal(usdc?.source, "privy");
  });
});
