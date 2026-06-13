import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import {
  buildPendingTransactionPreview,
  clearPendingTransactionsForTests,
  orderRequiresApprovalWithPermissions,
  transferRequiresApprovalWithPermissions,
} from "../../../src/services/agent/transaction-approval.service.js";
import {
  estimateOrderNotionalSui,
  isDeepBookOrderAction,
  parseDeepBookCancelAllOrdersParams,
  parseDeepBookCancelOrderParams,
  parseDeepBookCancelOrdersParams,
  parseDeepBookLimitOrderParams,
  parseDeepBookMarketOrderParams,
  parseDeepBookModifyOrderParams,
  parseDeepBookWithdrawSettledParams,
  resetDeepBookOrdersServiceForTests,
} from "../../../src/services/defi/deepbook-orders.service.js";
import {
  buildUnsupportedCapabilityNudge,
  detectUnsupportedCapability,
} from "../../../src/services/agent/unsupported-capabilities.js";

describe("deepbook-orders.service", () => {
  afterEach(async () => {
    resetDeepBookOrdersServiceForTests();
    await clearPendingTransactionsForTests();
  });

  it("parseDeepBookLimitOrderParams accepts buy side", () => {
    const parsed = parseDeepBookLimitOrderParams({
      pool_key: "SUI_USDC",
      price: 2.5,
      quantity: 10,
      side: "buy",
      pay_with_deep: false,
    });
    assert.equal(parsed.pool_key, "SUI_USDC");
    assert.equal(parsed.price, 2.5);
    assert.equal(parsed.quantity, 10);
    assert.equal(parsed.is_bid, true);
    assert.equal(parsed.pay_with_deep, false);
  });

  it("parseDeepBookLimitOrderParams maps sell to ask", () => {
    const parsed = parseDeepBookLimitOrderParams({
      pool_key: "SUI_USDC",
      price: 2.5,
      quantity: 1,
      side: "sell",
    });
    assert.equal(parsed.is_bid, false);
  });

  it("parseDeepBookMarketOrderParams accepts quantity alias", () => {
    const parsed = parseDeepBookMarketOrderParams({
      pool_key: "SUI_USDC",
      amount: 0.5,
      side: "buy",
    });
    assert.equal(parsed.quantity, 0.5);
    assert.equal(parsed.is_bid, true);
  });

  it("parseDeepBookCancelOrderParams requires order_id", () => {
    assert.throws(
      () => parseDeepBookCancelOrderParams({ pool_key: "SUI_USDC" }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
    const parsed = parseDeepBookCancelOrderParams({
      pool_key: "SUI_USDC",
      order_id: "12345",
    });
    assert.equal(parsed.order_id, "12345");
  });

  it("parseDeepBookCancelAllOrdersParams defaults pool", () => {
    const parsed = parseDeepBookCancelAllOrdersParams({});
    assert.equal(parsed.pool_key, "SUI_USDC");
  });

  it("parseDeepBookCancelOrdersParams accepts order id list", () => {
    const parsed = parseDeepBookCancelOrdersParams({
      pool_key: "SUI_USDC",
      order_ids: ["101", 202],
    });
    assert.deepEqual(parsed.order_ids, ["101", "202"]);
  });

  it("parseDeepBookCancelOrdersParams rejects empty list", () => {
    assert.throws(
      () => parseDeepBookCancelOrdersParams({ pool_key: "SUI_USDC", order_ids: [] }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("parseDeepBookModifyOrderParams requires order_id and quantity", () => {
    assert.throws(
      () => parseDeepBookModifyOrderParams({ pool_key: "SUI_USDC", quantity: 1 }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
    const parsed = parseDeepBookModifyOrderParams({
      pool_key: "SUI_USDC",
      order_id: "abc",
      quantity: 2.5,
    });
    assert.equal(parsed.order_id, "abc");
    assert.equal(parsed.quantity, 2.5);
  });

  it("parseDeepBookWithdrawSettledParams defaults pool", () => {
    const parsed = parseDeepBookWithdrawSettledParams({});
    assert.equal(parsed.pool_key, "SUI_USDC");
  });

  it("isDeepBookOrderAction recognizes order actions", () => {
    assert.equal(isDeepBookOrderAction("deepbook_place_limit_order"), true);
    assert.equal(isDeepBookOrderAction("deepbook_cancel_order"), true);
    assert.equal(isDeepBookOrderAction("deepbook_cancel_orders"), true);
    assert.equal(isDeepBookOrderAction("deepbook_modify_order"), true);
    assert.equal(isDeepBookOrderAction("deepbook_withdraw_settled_amounts"), true);
    assert.equal(isDeepBookOrderAction("swap"), false);
  });

  it("estimateOrderNotionalSui uses base quantity on SUI pools", () => {
    const pool = { pool_key: "SUI_USDC", base_coin: "SUI", quote_coin: "USDC" };
    assert.equal(estimateOrderNotionalSui(pool, 5, 2, true, null), 5);
    assert.equal(estimateOrderNotionalSui(pool, 5, 2, false, null), 5);
  });

  it("orderRequiresApprovalWithPermissions respects auto-approve threshold", () => {
    const permissions = {
      ...defaultAgentPermissions(),
      auto_approve_enabled: true,
      auto_approve_max_sui: 25,
    };

    const small = orderRequiresApprovalWithPermissions(permissions, {
      chain_id: "sui",
      action: "deepbook_place_limit_order",
      params: {
        pool_key: "SUI_USDC",
        price: 2,
        quantity: 1,
        side: "sell",
      },
    });
    assert.equal(small, false);

    const large = orderRequiresApprovalWithPermissions(permissions, {
      chain_id: "sui",
      action: "deepbook_place_limit_order",
      params: {
        pool_key: "SUI_USDC",
        price: 2,
        quantity: 100,
        side: "sell",
      },
    });
    assert.equal(large, true);
  });

  it("cancel order always requires approval", () => {
    const permissions = {
      ...defaultAgentPermissions(),
      auto_approve_enabled: true,
      auto_approve_max_sui: 25,
    };
    const needs = transferRequiresApprovalWithPermissions(permissions, {
      chain_id: "sui",
      action: "deepbook_cancel_order",
      params: { pool_key: "SUI_USDC", order_id: "99" },
    });
    assert.equal(needs, true);
  });

  it("batch cancel and modify always require approval", () => {
    const permissions = {
      ...defaultAgentPermissions(),
      auto_approve_enabled: true,
      auto_approve_max_sui: 25,
    };
    assert.equal(
      transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "deepbook_cancel_orders",
        params: { pool_key: "SUI_USDC", order_ids: ["1", "2"] },
      }),
      true,
    );
    assert.equal(
      transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "deepbook_modify_order",
        params: { pool_key: "SUI_USDC", order_id: "1", quantity: 2 },
      }),
      true,
    );
  });

  it("withdraw settled always requires approval", () => {
    const permissions = {
      ...defaultAgentPermissions(),
      auto_approve_enabled: true,
      auto_approve_max_sui: 25,
    };
    assert.equal(
      transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "deepbook_withdraw_settled_amounts",
        params: { pool_key: "SUI_USDC" },
      }),
      true,
    );
  });

  it("buildPendingTransactionPreview formats modify order summary", async () => {
    const pending = await buildPendingTransactionPreview("privy-test", {
      chain_id: "sui",
      action: "deepbook_modify_order",
      params: {
        pool_key: "SUI_USDC",
        order_id: "order-123",
        quantity: 4,
      },
    });
    assert.match(pending.summary, /modify/i);
    assert.match(pending.amount_display, /qty 4/);
  });

  it("buildPendingTransactionPreview formats limit order summary", async () => {
    const pending = await buildPendingTransactionPreview("privy-test", {
      chain_id: "sui",
      action: "deepbook_place_limit_order",
      params: {
        pool_key: "SUI_USDC",
        price: 2.1,
        quantity: 3,
        side: "buy",
      },
    });
    assert.match(pending.summary, /limit order/i);
    assert.match(pending.amount_display, /buy 3 @ 2.1/);
  });
});

describe("unsupported-capabilities after orders", () => {
  it("does not flag open orders requests", () => {
    assert.equal(detectUnsupportedCapability("Show my open orders on DeepBook."), null);
    assert.equal(
      detectUnsupportedCapability("Place a limit order to buy SUI at 2 USDC on DeepBook."),
      null,
    );
    assert.equal(detectUnsupportedCapability("Cancel all my orders on SUI_USDC"), null);
  });

  it("does not flag supported flash loan requests", () => {
    assert.equal(detectUnsupportedCapability("I want a flash loan on DeepBook"), null);
  });

  it("does not flag modify or claim settled requests", () => {
    assert.equal(detectUnsupportedCapability("Modify order 123 to quantity 5 on SUI_USDC"), null);
    assert.equal(detectUnsupportedCapability("Claim my settled proceeds from DeepBook"), null);
  });
});
