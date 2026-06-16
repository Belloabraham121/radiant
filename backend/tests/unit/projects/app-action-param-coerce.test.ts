import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import { parseAppActionParams } from "../../../src/services/projects/app-action-mapper.js";
import {
  coerceFiniteNumber,
  coerceIsBid,
  coercePositiveNumber,
  DEFAULT_APP_MARGIN_MANAGER_KEY,
  normalizeAppActionParams,
  normalizeMarginAppActionParams,
} from "../../../src/services/projects/app-action-param-coerce.js";

describe("app-action-param-coerce", () => {
  it("coerces string numbers", () => {
    assert.equal(coerceFiniteNumber("4.5"), 4.5);
    assert.equal(coercePositiveNumber("3.648353"), 3.648353);
    assert.equal(coercePositiveNumber("0"), undefined);
  });

  it("normalizes swap estimated_out_display from string", () => {
    const normalized = normalizeAppActionParams("swap", {
      amount: 1,
      side: "buy",
      estimated_out_display: "2.34",
    });
    assert.equal(normalized.estimated_out_display, 2.34);
  });

  it("coerces is_bid from buy/sell strings", () => {
    assert.equal(coerceIsBid("buy"), true);
    assert.equal(coerceIsBid("sell"), false);
    assert.equal(coerceIsBid("true"), true);
    assert.equal(coerceIsBid("false"), false);
  });

  it("defaults margin_manager_key and coerces amount for margin_deposit", () => {
    const normalized = normalizeAppActionParams("margin_deposit", {
      coin_type: "base",
      amount: "1.5",
    });
    assert.equal(normalized.margin_manager_key, DEFAULT_APP_MARGIN_MANAGER_KEY);
    assert.equal(normalized.amount, 1.5);
  });

  it("coerces order fields and is_bid from side for margin_place_limit_order", () => {
    const normalized = normalizeAppActionParams("margin_place_limit_order", {
      pool_key: "SUI_DBUSDC",
      price: "1.23",
      quantity: "10",
      side: "buy",
    });
    assert.equal(normalized.margin_manager_key, DEFAULT_APP_MARGIN_MANAGER_KEY);
    assert.equal(normalized.price, 1.23);
    assert.equal(normalized.quantity, 10);
    assert.equal(normalized.is_bid, true);
  });

  it("coerces new_quantity for margin_modify_order", () => {
    const normalized = normalizeAppActionParams("margin_modify_order", {
      order_id: "123",
      new_quantity: "2.5",
    });
    assert.equal(normalized.new_quantity, 2.5);
  });

  it("does not default margin_manager_key for margin_provision_manager", () => {
    const normalized = normalizeAppActionParams("margin_provision_manager", {
      pool_key: "SUI_DBUSDC",
    });
    assert.equal("margin_manager_key" in normalized, false);
  });

  it("does not default margin_manager_key for margin_liquidate", () => {
    const params: Record<string, unknown> = {
      margin_manager_address: `0x${"a".repeat(64)}`,
      repay_amount: "100",
    };
    normalizeMarginAppActionParams("margin_liquidate", params);
    assert.equal("margin_manager_key" in params, false);
    assert.equal(params.repay_amount, 100);
  });

  it("parseAppActionParams accepts margin_deposit without explicit margin_manager_key", () => {
    const parsed = parseAppActionParams("margin_deposit", {
      coin_type: "quote",
      amount: "25",
    });
    assert.equal(parsed.margin_manager_key, DEFAULT_APP_MARGIN_MANAGER_KEY);
    assert.equal(parsed.amount, 25);
  });

  it("parseAppActionParams accepts margin_place_market_order with side sell", () => {
    const parsed = parseAppActionParams("margin_place_market_order", {
      pool_key: "SUI_DBUSDC",
      quantity: "5",
      side: "sell",
    });
    assert.equal(parsed.is_bid, false);
    assert.equal(parsed.quantity, 5);
  });

  it("parseAppActionParams rejects margin_place_market_order without is_bid or side", () => {
    assert.throws(
      () =>
        parseAppActionParams("margin_place_market_order", {
          pool_key: "SUI_DBUSDC",
          quantity: 5,
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });
});
