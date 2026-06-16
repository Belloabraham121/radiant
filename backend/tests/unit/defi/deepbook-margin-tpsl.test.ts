import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  parseMarginTpslAddParams,
  resolveTpslType,
  resolveTriggerBelowPrice,
} from "../../../src/services/defi/deepbook/deepbook-margin-tpsl.service.js";
import { formatMarginTpslInfoSummary } from "../../../src/services/defi/deepbook/deepbook-margin-tpsl-read.service.js";
import { summarizeQueryChainResult } from "../../../src/services/agent/runtime/summarize-query-chain.js";

describe("deepbook-margin-tpsl", () => {
  it("maps take_profit to trigger above price", () => {
    assert.equal(resolveTpslType({ tpsl_type: "take_profit" }), "take_profit");
    assert.equal(resolveTriggerBelowPrice({ tpsl_type: "take_profit" }), false);
  });

  it("maps stop_loss to trigger below price", () => {
    assert.equal(resolveTpslType({ tpsl_type: "stop_loss" }), "stop_loss");
    assert.equal(resolveTriggerBelowPrice({ tpsl_type: "stop_loss" }), true);
  });

  it("parses market TPSL add params", () => {
    const parsed = parseMarginTpslAddParams({
      tpsl_type: "take_profit",
      trigger_price: 2.5,
      quantity: 10,
      side: "sell",
      order_kind: "market",
      conditional_order_id: "42",
    });

    assert.equal(parsed.tpslType, "take_profit");
    assert.equal(parsed.triggerBelowPrice, false);
    assert.equal(parsed.conditionalOrderId, "42");
    assert.equal(parsed.pendingOrder.kind, "market");
    assert.equal(parsed.pendingOrder.quantity, 10);
    assert.equal(parsed.pendingOrder.isBid, false);
  });

  it("parses limit TPSL add params", () => {
    const parsed = parseMarginTpslAddParams({
      tpsl_type: "stop_loss",
      trigger_price: 1.8,
      quantity: 5,
      is_bid: true,
      order_kind: "limit",
      price: 1.75,
    });

    assert.equal(parsed.triggerBelowPrice, true);
    assert.equal(parsed.pendingOrder.kind, "limit");
    if (parsed.pendingOrder.kind === "limit") {
      assert.equal(parsed.pendingOrder.price, 1.75);
      assert.equal(parsed.pendingOrder.isBid, true);
    }
  });

  it("requires tpsl_type", () => {
    assert.throws(
      () => parseMarginTpslAddParams({ trigger_price: 1, quantity: 1 }),
      (err: unknown) => err instanceof AppError,
    );
  });

  it("formats margin TPSL info summary", () => {
    const summary = formatMarginTpslInfoSummary({
      provisioned: true,
      margin_manager_address: `0x${"a".repeat(64)}`,
      pool_key: "SUI_USDC",
      conditional_order_ids: ["1", "2"],
      lowest_trigger_above_price: "2500000",
      highest_trigger_below_price: "1800000",
    });

    assert.match(summary, /Conditional order IDs: 1, 2/);
    assert.match(summary, /take-profit trigger/);
  });

  it("summarizeQueryChainResult handles margin_tpsl_info", () => {
    const summary = summarizeQueryChainResult({
      provisioned: true,
      margin_manager_address: `0x${"b".repeat(64)}`,
      pool_key: "SUI_USDC",
      conditional_order_ids: [],
      lowest_trigger_above_price: "0",
      highest_trigger_below_price: "0",
      note: "No conditional orders",
    });

    assert.ok(summary);
    assert.match(summary!, /No conditional TPSL orders/);
  });
});
