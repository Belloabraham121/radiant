import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getDeepBookEnv, resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import {
  parseMarginPoolInfoQuery,
  shapeMarginRiskRatioResponse,
} from "../../../src/services/defi/deepbook/deepbook-margin-app-read.service.js";
import type { MarginManagerInfoQueryResult } from "../../../src/services/defi/deepbook/deepbook-margin-read.service.js";

describe("deepbook-margin-app-read.service", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDeepBookEnvForTests();
  });

  it("parseMarginPoolInfoQuery defaults pool_key from env", () => {
    process.env.DEEPBOOK_ENV = "testnet";
    process.env.SUI_NETWORK = "testnet";
    resetDeepBookEnvForTests();

    const params = parseMarginPoolInfoQuery({});
    assert.equal(params.pool_key, getDeepBookEnv().defaultPool);
  });

  it("parseMarginPoolInfoQuery preserves explicit pool_key", () => {
    const params = parseMarginPoolInfoQuery({ pool_key: "DEEP_USDC" });
    assert.equal(params.pool_key, "DEEP_USDC");
  });

  it("shapeMarginRiskRatioResponse returns focused live metrics", () => {
    const info: MarginManagerInfoQueryResult = {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: `0x${"a".repeat(64)}`,
      live_state: {
        pool_key: "SUI_DBUSDC",
        owner: `0x${"b".repeat(64)}`,
        deepbook_pool: `0x${"c".repeat(64)}`,
        margin_pool_id: null,
        risk_ratio: 2.5,
        max_leverage: 5,
        liquidation_ratio: 1.1,
        borrow_threshold: 1.25,
        base_balance: "100",
        quote_balance: "200",
        base_debt: "0",
        quote_debt: "50",
        base_asset: "SUI",
        quote_asset: "USDC",
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
      },
    };

    const result = shapeMarginRiskRatioResponse(info);

    assert.equal(result.provisioned, true);
    assert.equal(result.pool_key, "SUI_DBUSDC");
    assert.equal(result.risk_ratio, 2.5);
    assert.equal(result.quote_debt, "50");
  });

  it("shapeMarginRiskRatioResponse handles unprovisioned manager", () => {
    const result = shapeMarginRiskRatioResponse({
      provisioned: false,
      note: "No margin manager found.",
      available_margin_pools: ["SUI_DBUSDC"],
    });

    assert.equal(result.provisioned, false);
    assert.equal(result.note, "No margin manager found.");
    assert.deepEqual(result.available_margin_pools, ["SUI_DBUSDC"]);
    assert.equal("risk_ratio" in result, false);
  });
});
