import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMarginOpenOrdersSummary,
  type MarginOpenOrdersQueryResult,
} from "../../../src/services/defi/deepbook/deepbook-margin-open-orders-read.service.js";
import { summarizeQueryChainResult } from "../../../src/services/agent/runtime/summarize-query-chain.js";

describe("deepbook-margin-open-orders-read.service", () => {
  it("formats empty margin open orders", () => {
    const result: MarginOpenOrdersQueryResult = {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: `0x${"a".repeat(64)}`,
      pool_key: "SUI_USDC",
      orders: [],
      source: "sdk",
    };

    const summary = formatMarginOpenOrdersSummary(result);
    assert.match(summary, /No open margin orders on SUI_USDC/);
  });

  it("formats margin open orders list", () => {
    const result: MarginOpenOrdersQueryResult = {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: `0x${"a".repeat(64)}`,
      pool_key: "SUI_USDC",
      source: "sdk",
      orders: [
        {
          order_id: "12345678901234567890",
          pool_key: "SUI_USDC",
          client_order_id: "1",
          price: 2.5,
          quantity: 10,
          remaining_quantity: 8,
          is_bid: true,
          status: "open",
        },
        {
          order_id: "98765432109876543210",
          pool_key: "SUI_USDC",
          client_order_id: "2",
          price: 2.6,
          quantity: 5,
          remaining_quantity: 5,
          is_bid: false,
          status: "open",
        },
      ],
    };

    const summary = formatMarginOpenOrdersSummary(result);
    assert.match(summary, /Open margin orders on SUI_USDC \(2\)/);
    assert.match(summary, /buy 8 @ 2\.5/);
    assert.match(summary, /sell 5 @ 2\.6/);
  });

  it("summarizeQueryChainResult handles margin open orders", () => {
    const summary = summarizeQueryChainResult({
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: `0x${"b".repeat(64)}`,
      pool_key: "SUI_USDC",
      source: "sdk",
      orders: [
        {
          order_id: "111",
          pool_key: "SUI_USDC",
          client_order_id: "1",
          price: 1.2,
          quantity: 3,
          remaining_quantity: 3,
          is_bid: true,
          status: "open",
        },
      ],
    });

    assert.ok(summary);
    assert.match(summary!, /Open margin orders on SUI_USDC/);
  });
});
