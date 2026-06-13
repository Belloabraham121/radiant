import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTransactionDisplay,
  enrichDisplayFromResult,
} from "../../../src/services/agent-transaction/deepbook/build-display.js";
import type { TxResult } from "../../../src/services/chains/types.js";

describe("buildTransactionDisplay", () => {
  it("formats swap display", async () => {
    const display = await buildTransactionDisplay(null, {
      chain_id: "sui",
      action: "swap",
      params: {
        pool_key: "SUI_USDC",
        amount: 10,
        side: "sell",
        estimated_out_display: 24.5,
      },
    });
    assert.match(display.title, /swap/i);
    assert.match(display.amount_display, /10 SUI/);
    assert.match(display.amount_display, /24\.5/);
  });

  it("formats limit order display", async () => {
    const display = await buildTransactionDisplay(null, {
      chain_id: "sui",
      action: "deepbook_place_limit_order",
      params: {
        pool_key: "SUI_USDC",
        price: 2.1,
        quantity: 3,
        side: "buy",
      },
    });
    assert.match(display.title, /limit order/i);
    assert.match(display.amount_display, /buy 3 @ 2\.1/);
  });

  it("formats deposit display", async () => {
    const display = await buildTransactionDisplay(null, {
      chain_id: "sui",
      action: "deepbook_deposit",
      params: { coin_key: "SUI", amount_display: 1.5 },
    });
    assert.match(display.title, /deposit/i);
    assert.match(display.amount_display, /1\.5 SUI/);
  });

  it("formats cancel display", async () => {
    const display = await buildTransactionDisplay(null, {
      chain_id: "sui",
      action: "deepbook_cancel_order",
      params: { pool_key: "SUI_USDC", order_id: "order-abc-123" },
    });
    assert.match(display.title, /cancel/i);
    assert.match(display.amount_display, /order-abc/);
  });

  it("formats modify display", async () => {
    const display = await buildTransactionDisplay(null, {
      chain_id: "sui",
      action: "deepbook_modify_order",
      params: { pool_key: "SUI_USDC", order_id: "order-99", quantity: 4 },
    });
    assert.match(display.title, /modify/i);
    assert.match(display.amount_display, /qty 4/);
  });
});

describe("enrichDisplayFromResult", () => {
  it("replaces estimate with actual swap fills", () => {
    const result: TxResult = {
      chain_id: "sui",
      digest: "abc",
      address: "0x1",
      effects_status: "success",
      deepbook: {
        swap: {
          pool_key: "SUI_USDC",
          side: "sell",
          input_coin: "SUI",
          output_coin: "USDC",
          in_amount_display: 10,
          out_amount_display: 24.1,
          fee_deep: null,
          price: 2.41,
        },
      },
    };

    const enriched = enrichDisplayFromResult("10 SUI → ~24.5 USDC", result);
    assert.equal(enriched, "10 SUI → 24.1 USDC");
  });

  it("formats large swap fills with thousands separators", () => {
    const result: TxResult = {
      chain_id: "sui",
      digest: "abc",
      address: "0x1",
      effects_status: "success",
      deepbook: {
        swap: {
          pool_key: "SUI_USDC",
          side: "sell",
          input_coin: "SUI",
          output_coin: "USDC",
          in_amount_display: 10_000,
          out_amount_display: 24_000.5,
          fee_deep: null,
          price: 2.4,
        },
      },
    };

    const enriched = enrichDisplayFromResult("estimate", result);
    assert.equal(enriched, "10,000 SUI → 24,000.5 USDC");
  });
});
