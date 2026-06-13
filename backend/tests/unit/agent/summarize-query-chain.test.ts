import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeQueryChainResult } from "../../../src/services/agent/runtime/summarize-query-chain.js";

describe("summarizeQueryChainResult", () => {
  it("summarizes deepbook_pools with pool keys", () => {
    const summary = summarizeQueryChainResult({
      pools: [
        {
          pool_key: "DEEP_USDC",
          base_coin: "DEEP",
          quote_coin: "USDC",
          last_price: 0.12,
          volume_24h: 1000,
        },
        {
          pool_key: "SUI_USDC",
          base_coin: "SUI",
          quote_coin: "USDC",
          last_price: 2.1,
          volume_24h: 5000,
        },
      ],
      default_pool: "SUI_USDC",
      source: "indexer",
    });

    assert.ok(summary);
    assert.match(summary!, /DEEP_USDC/);
    assert.match(summary!, /SUI_USDC/);
    assert.match(summary!, /2\)/);
  });

  it("summarizes deepbook_pool_info with price and fees", () => {
    const summary = summarizeQueryChainResult({
      pool_key: "DEEP_USDC",
      pool_id: "0xabc",
      base_coin: "DEEP",
      quote_coin: "USDC",
      base_asset_name: "DeepBook Token",
      quote_asset_name: "USDC",
      min_size: 1,
      min_size_display: 1,
      lot_size: 1,
      lot_size_display: 0.1,
      tick_size: 1,
      tick_size_display: 0.0001,
      ticker: { pool_key: "DEEP_USDC", last_price: 0.11, base_volume_24h: 1, quote_volume_24h: 2, is_frozen: false },
      on_chain: { taker_fee: 0.001, maker_fee: 0.0005, stake_required: 100, tick_size: 0.0001, lot_size: 0.1, min_size: 1 },
    });

    assert.ok(summary);
    assert.match(summary!, /DEEP_USDC/);
    assert.match(summary!, /Last price: 0.11/);
  });
});
