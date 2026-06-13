import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeHistoricalVolumeAtomic,
  normalizeOhlcvCandle,
  normalizeTradeRecord,
} from "../../../src/services/defi/indexer/normalize.js";
import type { IndexerTradeRecord } from "../../../src/services/defi/indexer/indexer.types.js";
import type { IndexerPoolRecord } from "../../../src/services/defi/indexer/indexer.types.js";

const SAMPLE_POOL: IndexerPoolRecord = {
  pool_id: "0xabc",
  pool_name: "SUI_USDC",
  base_asset_id: "0x2::sui::SUI",
  base_asset_decimals: 9,
  base_asset_symbol: "SUI",
  base_asset_name: "Sui",
  quote_asset_id: "0xusdc::usdc::USDC",
  quote_asset_decimals: 6,
  quote_asset_symbol: "USDC",
  quote_asset_name: "USDC",
  min_size: 1_000_000_000,
  lot_size: 100_000_000,
  tick_size: 10_000,
};

const SAMPLE_TRADE: IndexerTradeRecord = {
  trade_id: "123",
  price: 1.25,
  type: "buy",
  digest: "0xabc",
  timestamp: 1_700_000_000_000,
  base_volume: 10,
  quote_volume: 12.5,
  taker_is_bid: true,
  maker_balance_manager_id: "0xmaker",
  taker_balance_manager_id: "0xtaker",
  maker_order_id: "1",
  taker_order_id: "2",
  maker_fee: 0,
  taker_fee: 0.01,
  maker_fee_is_deep: false,
  taker_fee_is_deep: true,
};

describe("indexer analytics normalize", () => {
  it("normalizes trade side from taker_is_bid", () => {
    const buy = normalizeTradeRecord("SUI_USDC", SAMPLE_TRADE);
    assert.equal(buy.side, "buy");
    assert.equal(buy.quote_volume, 12.5);

    const sell = normalizeTradeRecord("SUI_USDC", {
      ...SAMPLE_TRADE,
      taker_is_bid: false,
    });
    assert.equal(sell.side, "sell");
  });

  it("normalizes OHLCV candle tuple", () => {
    const candle = normalizeOhlcvCandle([1_700_000_000_000, 1.1, 1.2, 1.0, 1.15, 500]);
    assert.equal(candle.timestamp_ms, 1_700_000_000_000);
    assert.equal(candle.close, 1.15);
    assert.equal(candle.base_volume, 500);
  });

  it("normalizes historical volume atomic to quote display", () => {
    const volume = normalizeHistoricalVolumeAtomic("SUI_USDC", 1_500_000, SAMPLE_POOL);
    assert.equal(volume.quote_volume, 1.5);
    assert.equal(volume.quote_coin, "USDC");
  });
});
