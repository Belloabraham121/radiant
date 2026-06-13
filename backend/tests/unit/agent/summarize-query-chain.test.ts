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

  it("returns agent_transactions summary for the model", () => {
    const summary = summarizeQueryChainResult({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          status: "success",
          category: "swap",
          chain_id: "sui",
          title: "Swap on DeepBook (SUI_USDC)",
          amount_display: "0.5 SUI → ~1.2 USDC",
          digest: "9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm",
          effects_status: "success",
          session_id: null,
          message_id: null,
          created_at: "2026-06-13T00:48:00.000Z",
          completed_at: "2026-06-13T00:48:05.000Z",
        },
      ],
      total: 1,
      limit: 10,
      summary:
        "Most recent agent transaction:\n\n1. Swap on DeepBook (SUI_USDC)\n   Date: June 13, 2026 at 12:48 AM UTC\n   Amount: 0.5 SUI → ~1.2 USDC\n   Status: Success\n   Digest: 9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm",
    });

    assert.ok(summary);
    assert.match(summary!, /Status: Success/);
    assert.match(summary!, /0\.5 SUI → ~1\.2 USDC/);
    assert.doesNotMatch(summary!, /Insert Date/i);
  });
});
