import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import {
  formatMarginManagerLiveStateSummary,
  poolKeyFromDeepBookPoolAddress,
} from "../../../src/services/defi/deepbook/deepbook-margin-read.service.js";
import type { MarginManagerLiveState } from "../../../src/services/defi/deepbook/deepbook-margin-read.service.js";
import { summarizeQueryChainResult } from "../../../src/services/agent/runtime/summarize-query-chain.js";

describe("deepbook-margin-read.service", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDeepBookEnvForTests();
  });

  it("maps deepbook pool address to pool key on mainnet", () => {
    process.env.DEEPBOOK_ENV = "mainnet";
    resetDeepBookEnvForTests();

    assert.equal(
      poolKeyFromDeepBookPoolAddress(
        "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
      ),
      "SUI_USDC",
    );
    assert.equal(poolKeyFromDeepBookPoolAddress(`0x${"f".repeat(64)}`), null);
  });

  it("formats live margin manager state for agent summary", () => {
    const live: MarginManagerLiveState = {
      pool_key: "SUI_USDC",
      owner: `0x${"1".repeat(64)}`,
      deepbook_pool: `0x${"2".repeat(64)}`,
      margin_pool_id: null,
      risk_ratio: 2.3456,
      base_asset: "10.5",
      quote_asset: "100.25",
      base_debt: "0",
      quote_debt: "50",
      base_balance: "10",
      quote_balance: "100",
      deep_balance: "1",
      borrowed_base_shares: "0",
      borrowed_quote_shares: "5000000",
      has_base_debt: false,
      base_pyth_price: "1000000000",
      base_pyth_decimals: 8,
      quote_pyth_price: "1000000",
      quote_pyth_decimals: 6,
      current_price: "123456789",
      lowest_trigger_above_price: "0",
      highest_trigger_below_price: "0",
      max_leverage: 5,
      liquidation_ratio: 1.1,
      borrow_threshold: 1.25,
    };

    const summary = formatMarginManagerLiveStateSummary(live);
    assert.match(summary, /risk ratio 2\.3456/);
    assert.match(summary, /debt 50 \(quote\)/);
    assert.match(summary, /pool SUI_USDC/);
  });

  it("summarizeQueryChainResult includes live margin state", () => {
    const summary = summarizeQueryChainResult({
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: `0x${"a".repeat(64)}`,
      live_state: {
        pool_key: "SUI_USDC",
        owner: `0x${"1".repeat(64)}`,
        deepbook_pool: `0x${"2".repeat(64)}`,
        margin_pool_id: null,
        risk_ratio: 1.8,
        base_asset: "5",
        quote_asset: "20",
        base_debt: "0",
        quote_debt: "0",
        base_balance: "5",
        quote_balance: "20",
        deep_balance: "0",
        borrowed_base_shares: "0",
        borrowed_quote_shares: "0",
        has_base_debt: false,
        base_pyth_price: "1",
        base_pyth_decimals: 8,
        quote_pyth_price: "1",
        quote_pyth_decimals: 6,
        current_price: "1",
        lowest_trigger_above_price: "0",
        highest_trigger_below_price: "0",
        max_leverage: 5,
        liquidation_ratio: 1.1,
        borrow_threshold: 1.25,
      },
    });

    assert.ok(summary);
    assert.match(summary!, /Live state:/);
    assert.match(summary!, /no open debt/);
  });
});
