import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMarginAtRiskSummary,
  formatMarginCollateralSummary,
  formatMarginLiquidationsSummary,
  formatMarginLoanHistorySummary,
  formatMarginManagerCreatedSummary,
  formatMarginSupplyHistorySummary,
  formatMarginManagerStateSummary,
} from "../../../src/services/defi/deepbook/deepbook-margin-indexer-read.service.js";

describe("deepbook-margin-indexer-read formatters", () => {
  it("formats liquidation events", () => {
    const summary = formatMarginLiquidationsSummary([
      {
        event_digest: "e1",
        digest: "d1",
        sender: "0xs",
        checkpoint: 1,
        checkpoint_timestamp_ms: 1_700_000_000_000,
        package: "0xp",
        onchain_timestamp: 1_700_000_000_000,
        margin_manager_id: "0xmanager1234567890",
        margin_pool_id: "0xpool",
        liquidation_amount: 100,
        pool_reward: 1,
        pool_default: 0,
        risk_ratio: 1_500_000_000,
      },
    ]);

    assert.match(summary, /1 liquidation event/);
    assert.match(summary, /0xmanager1/);
  });

  it("formats empty collateral history", () => {
    assert.equal(
      formatMarginCollateralSummary([]),
      "No collateral deposit/withdraw events in the requested window.",
    );
  });

  it("formats manager created events", () => {
    const summary = formatMarginManagerCreatedSummary([
      {
        event_digest: "e1",
        digest: "d1",
        sender: "0xs",
        checkpoint: 1,
        checkpoint_timestamp_ms: 1,
        package: "0xp",
        onchain_timestamp: 1_700_000_000_000,
        margin_manager_id: "0xmanager1234567890",
        balance_manager_id: "0xbm",
        deepbook_pool_id: "0xpool",
        owner: "0xowner1234567890",
      },
    ]);
    assert.match(summary, /creation event/);
  });

  it("formats supply history counts", () => {
    const summary = formatMarginSupplyHistorySummary(
      [
        {
          event_digest: "e1",
          digest: "d1",
          sender: "0xs",
          checkpoint: 1,
          checkpoint_timestamp_ms: 1,
          package: "0xp",
          onchain_timestamp: 1_700_000_000_000,
          margin_pool_id: "0xpool",
          asset_type: "0x2::sui::SUI",
          supplier: "0xsupplier",
          amount: 100,
          shares: 100,
        },
      ],
      [],
    );
    assert.match(summary, /1 supply event/);
  });

  it("formats loan history counts", () => {
    const summary = formatMarginLoanHistorySummary(
      [
        {
          event_digest: "e1",
          digest: "d1",
          sender: "0xs",
          checkpoint: 1,
          checkpoint_timestamp_ms: 1,
          package: "0xp",
          onchain_timestamp: 1_700_000_000_000,
          margin_manager_id: "0xm",
          margin_pool_id: "0xp",
          loan_amount: 50,
          loan_shares: 10,
        },
      ],
      [],
    );

    assert.match(summary, /1 borrow event/);
    assert.match(summary, /0 repay event/);
  });

  it("formats at-risk states with max risk filter message", () => {
    assert.equal(
      formatMarginAtRiskSummary([], 1.2),
      "No margin managers below risk ratio 1.2.",
    );
  });

  it("formats margin manager state summary with price and triggers", () => {
    const summary = formatMarginManagerStateSummary({
      id: 1,
      margin_manager_id: "0xm",
      deepbook_pool_id: "0xp",
      base_margin_pool_id: "0xb",
      quote_margin_pool_id: "0xq",
      base_asset_id: "0xba",
      base_asset_symbol: "SUI",
      quote_asset_id: "0xqa",
      quote_asset_symbol: "USDC",
      risk_ratio: "1.85",
      base_asset: "1000000000",
      quote_asset: "5000000000",
      base_debt: "0",
      quote_debt: "2000000000",
      current_price: "2.45",
      lowest_trigger_above_price: "2.60",
      highest_trigger_below_price: "2.20",
    });
    assert.match(summary, /SUI\/USDC/);
    assert.match(summary, /price 2.45/);
    assert.match(summary, /TP trigger above 2.60/);
  });
});
