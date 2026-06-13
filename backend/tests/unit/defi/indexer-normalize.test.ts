import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePoolRecord,
  normalizeTickerEntry,
  toPoolSummary,
} from "../../../src/services/defi/indexer/normalize.js";
import type { IndexerPoolRecord, IndexerTickerRecord } from "../../../src/services/defi/indexer/indexer.types.js";

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

const SAMPLE_TICKER: IndexerTickerRecord = {
  last_price: 1.25,
  isFrozen: 0,
  base_volume: 12.5,
  quote_volume: 15.75,
};

describe("indexer normalize", () => {
  it("normalizes pool atomic sizes to display units", () => {
    const pool = normalizePoolRecord(SAMPLE_POOL);
    assert.equal(pool.pool_key, "SUI_USDC");
    assert.equal(pool.min_size_display, 1);
    assert.equal(pool.lot_size_display, 0.1);
    assert.equal(pool.tick_size_display, 0.01);
  });

  it("normalizes ticker entries with frozen flag", () => {
    const ticker = normalizeTickerEntry("SUI_USDC", SAMPLE_TICKER, SAMPLE_POOL);
    assert.equal(ticker.pool_key, "SUI_USDC");
    assert.equal(ticker.last_price, 1.25);
    assert.equal(ticker.is_frozen, false);

    const frozen = normalizeTickerEntry(
      "SUI_USDC",
      { ...SAMPLE_TICKER, isFrozen: 1 },
      SAMPLE_POOL,
    );
    assert.equal(frozen.is_frozen, true);
  });

  it("builds pool summary from normalized pool and ticker", () => {
    const pool = normalizePoolRecord(SAMPLE_POOL);
    const ticker = normalizeTickerEntry("SUI_USDC", SAMPLE_TICKER, SAMPLE_POOL);
    const summary = toPoolSummary(pool, ticker);
    assert.equal(summary.pool_key, "SUI_USDC");
    assert.equal(summary.last_price, 1.25);
    assert.equal(summary.volume_24h, 15.75);
  });
});
