import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { clearMemoryCacheForTests } from "../../../src/infrastructure/redis/cache.js";
import { clearTokenBucketsForTests } from "../../../src/infrastructure/rate-limit/token-bucket.js";
import {
  resetCoingeckoClientForTests,
  setCoingeckoFetchForTests,
} from "../../../src/services/market/coingecko.client.js";
import { enrichWalletAssetsWithMarketData } from "../../../src/services/market/coingecko.service.js";
import type { WalletAssetRow } from "../../../src/services/wallet/wallet-assets.types.js";

const BASE_ASSETS: WalletAssetRow[] = [
  {
    symbol: "SUI",
    name: "Sui",
    coin_type: "0x2::sui::SUI",
    balance_atomic: "2000000000",
    balance_display: 2,
    decimals: 9,
    usd_value: null,
    source: "sui_rpc",
    popular: true,
  },
  {
    symbol: "USDC",
    name: "USDC",
    coin_type: "0xusdc::usdc::USDC",
    balance_atomic: "5000000",
    balance_display: 5,
    decimals: 6,
    usd_value: null,
    source: "sui_rpc",
    popular: true,
  },
];

describe("enrichWalletAssetsWithMarketData", () => {
  before(() => {
    process.env.COINGECKO_API_KEY = "CG-test-key";
  });

  afterEach(() => {
    clearMemoryCacheForTests();
    clearTokenBucketsForTests();
    resetCoingeckoClientForTests();
  });

  it("adds logo_url and usd_value from CoinGecko markets", async () => {
    setCoingeckoFetchForTests(async (input) => {
      const url = String(input);
      assert.ok(url.includes("/coins/markets"));
      return new Response(
        JSON.stringify([
          {
            id: "sui",
            symbol: "sui",
            name: "Sui",
            image: "https://assets.coingecko.com/coins/images/sui/small.png",
            current_price: 2.5,
          },
          {
            id: "usd-coin",
            symbol: "usdc",
            name: "USDC",
            image: "https://assets.coingecko.com/coins/images/usdc/small.png",
            current_price: 1,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const enriched = await enrichWalletAssetsWithMarketData(BASE_ASSETS, true);
    const sui = enriched.find((row) => row.symbol === "SUI");
    const usdc = enriched.find((row) => row.symbol === "USDC");

    assert.equal(sui?.logo_url, "https://assets.coingecko.com/coins/images/sui/small.png");
    assert.equal(sui?.usd_price, 2.5);
    assert.equal(sui?.usd_value, 5);
    assert.equal(usdc?.usd_value, 5);
  });
});
