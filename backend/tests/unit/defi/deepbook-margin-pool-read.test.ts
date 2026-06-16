import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetDeepBookEnvForTests, getDeepBookEnv } from "../../../src/config/deepbook.js";
import {
  computeUtilizationRate,
  formatMarginPoolInfoSummary,
  formatMarginPoolLiveStateSummary,
  resolveCoinKeyForMarginPoolQuery,
} from "../../../src/services/defi/deepbook/deepbook-margin-pool-read.service.js";
import { summarizeQueryChainResult } from "../../../src/services/agent/runtime/summarize-query-chain.js";

describe("deepbook-margin-pool-read.service", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDeepBookEnvForTests();
  });

  it("computes utilization rate from supply and borrow", () => {
    assert.equal(computeUtilizationRate("100", "25"), 0.25);
    assert.equal(computeUtilizationRate("0", "0"), 0);
    assert.equal(computeUtilizationRate("0", "10"), null);
  });

  it("resolves coin key from coin_type on mainnet", () => {
    process.env.DEEPBOOK_ENV = "mainnet";
    resetDeepBookEnvForTests();

    assert.equal(resolveCoinKeyForMarginPoolQuery({ coin_type: "USDC" }), "USDC");
  });

  it("defaults coin key from trading pool_key", () => {
    process.env.DEEPBOOK_ENV = "testnet";
    process.env.SUI_NETWORK = "testnet";
    resetDeepBookEnvForTests();

    const coinKey = resolveCoinKeyForMarginPoolQuery({ pool_key: "SUI_DBUSDC" });
    assert.ok(Object.keys(getDeepBookEnv().marginPools).includes(coinKey));
  });

  it("formats live margin pool metrics", () => {
    const summary = formatMarginPoolLiveStateSummary({
      coin_key: "USDC",
      pool_id: `0x${"a".repeat(64)}`,
      total_supply: "1000000",
      total_borrow: "250000",
      supply_shares: "1000000",
      borrow_shares: "250000",
      interest_rate: 0.0525,
      utilization_rate: 0.25,
      max_utilization_rate: 0.9,
      supply_cap: "5000000",
      min_borrow: "10",
      protocol_spread: 0.01,
      last_update_timestamp: 1_700_000_000,
    });

    assert.match(summary, /USDC margin pool/);
    assert.match(summary, /utilization 25\.00%/);
    assert.match(summary, /interest rate 5\.2500%/);
  });

  it("summarizeQueryChainResult formats margin pool info", () => {
    const summary = summarizeQueryChainResult({
      pool_key: "SUI_USDC",
      coin_key: "USDC",
      max_leverage: 5,
      liquidation_ratio: 1.1,
      borrow_threshold: 1.25,
      available_margin_pools: ["SUI_USDC", "DEEP_USDC"],
      available_margin_pool_assets: ["SUI", "USDC", "DEEP"],
      live_state: {
        coin_key: "USDC",
        pool_id: `0x${"b".repeat(64)}`,
        total_supply: "500",
        total_borrow: "100",
        supply_shares: "500",
        borrow_shares: "100",
        interest_rate: 0.03,
        utilization_rate: 0.2,
        max_utilization_rate: 0.9,
        supply_cap: "10000",
        min_borrow: "1",
        protocol_spread: 0.01,
        last_update_timestamp: 1_700_000_000,
      },
    });

    assert.ok(summary);
    assert.match(summary!, /Margin-enabled trading pools: SUI_USDC, DEEP_USDC/);
    assert.match(summary!, /utilization 20\.00%/);
  });
});
