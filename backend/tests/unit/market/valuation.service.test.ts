import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { clearMemoryCacheForTests } from "../../../src/infrastructure/redis/cache.js";
import { clearTokenBucketsForTests } from "../../../src/infrastructure/rate-limit/token-bucket.js";
import {
  formatWalletAssetsSummary,
  previewSwapFiat,
} from "../../../src/services/market/valuation.service.js";
import {
  resetCoingeckoClientForTests,
  setCoingeckoFetchForTests,
} from "../../../src/services/market/coingecko.client.js";

describe("valuation.service", () => {
  before(() => {
    process.env.COINGECKO_API_KEY = "CG-test-key";
  });

  afterEach(() => {
    clearMemoryCacheForTests();
    clearTokenBucketsForTests();
    resetCoingeckoClientForTests();
  });

  it("formats wallet balances with USD totals", () => {
    const summary = formatWalletAssetsSummary({
      chain_id: "sui",
      address: "0x1",
      assets: [
        {
          symbol: "SUI",
          name: "Sui",
          coin_type: "0x2::sui::SUI",
          balance_atomic: "1000000000",
          balance_display: 1,
          decimals: 9,
          usd_value: 4.2,
          source: "sui_rpc",
          popular: true,
        },
        {
          symbol: "USDC",
          name: "USD Coin",
          coin_type: "0xusdc",
          balance_atomic: "5000000",
          balance_display: 5,
          decimals: 6,
          usd_value: 5,
          source: "sui_rpc",
          popular: true,
        },
      ],
      total_usd: 9.2,
      catalog_source: "indexer",
      updated_at: new Date().toISOString(),
    });

    assert.match(summary, /1 SUI \(~\$4\.2\)/);
    assert.match(summary, /5 USDC \(~\$5\)/);
    assert.match(summary, /Estimated total: ~\$9\.2/);
  });

  it("prices swap legs with stablecoin peg and coingecko", async () => {
    setCoingeckoFetchForTests(async (input) => {
      const url = String(input);
      assert.ok(url.includes("/coins/markets"));
      return new Response(
        JSON.stringify([
          {
            id: "sui",
            symbol: "sui",
            name: "Sui",
            image: "https://example.com/sui.png",
            current_price: 4,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const preview = await previewSwapFiat({
      chain_id: "sui",
      pay: { amount_display: 10, symbol: "SUI" },
      receive: { amount_display: 38.5, symbol: "USDC" },
    });

    assert.equal(preview.total_pay_usd, 40);
    assert.equal(preview.total_receive_usd, 38.5);
    assert.equal(preview.net_usd, -1.5);
    assert.equal(preview.legs[0]?.price_source, "coingecko");
    assert.equal(preview.legs[1]?.price_source, "stablecoin_peg");
  });

  it("uses pool mid price when coingecko is unavailable", async () => {
    setCoingeckoFetchForTests(async () => new Response("[]", { status: 200 }));

    const preview = await previewSwapFiat({
      chain_id: "sui",
      pay: { amount_display: 1, symbol: "SUI" },
      receive: { amount_display: 3.9, symbol: "USDC" },
      pool_price: 3.9,
      base_symbol: "SUI",
      quote_symbol: "USDC",
    });

    assert.equal(preview.legs[0]?.usd_value, 3.9);
    assert.equal(preview.legs[0]?.price_source, "pool_mid");
    assert.equal(preview.legs[1]?.price_source, "stablecoin_peg");
  });
});
