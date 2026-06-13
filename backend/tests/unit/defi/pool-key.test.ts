import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPoolByKey } from "../../../src/services/defi/indexer/normalize.js";
import { normalizePoolKey } from "../../../src/services/defi/pool-key.js";
import type { IndexerPoolRecord } from "../../../src/services/defi/indexer/indexer.types.js";

const POOLS: IndexerPoolRecord[] = [
  {
    pool_id: "0x1",
    pool_name: "DEEP_USDC",
    base_asset_id: "0xdeep",
    base_asset_decimals: 6,
    base_asset_symbol: "DEEP",
    base_asset_name: "DEEP",
    quote_asset_id: "0xusdc",
    quote_asset_decimals: 6,
    quote_asset_symbol: "USDC",
    quote_asset_name: "USDC",
    min_size: 1,
    lot_size: 1,
    tick_size: 1,
  },
];

describe("pool-key", () => {
  it("normalizePoolKey converts slashes and spaces", () => {
    assert.equal(normalizePoolKey("deep/usdc"), "DEEP_USDC");
    assert.equal(normalizePoolKey(" DEEP USDC "), "DEEP_USDC");
  });

  it("findPoolByKey resolves slash-form names", () => {
    const pool = findPoolByKey(POOLS, "DEEP/USDC");
    assert.equal(pool?.pool_name, "DEEP_USDC");
  });
});
