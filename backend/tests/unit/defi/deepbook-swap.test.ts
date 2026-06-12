import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  estimateSwapNotionalSui,
  parseDeepBookSwapParams,
  resetDeepBookSwapServiceForTests,
} from "../../../src/services/defi/deepbook-swap.service.js";
import {
  clearPendingTransactionsForTests,
  createPendingTransaction,
  swapRequiresApproval,
  transferRequiresApproval,
} from "../../../src/services/agent/transaction-approval.service.js";

describe("deepbook-swap.service", () => {
  afterEach(() => {
    resetDeepBookSwapServiceForTests();
    clearPendingTransactionsForTests();
  });

  it("parseDeepBookSwapParams accepts sell with amount", () => {
    const parsed = parseDeepBookSwapParams({
      pool_key: "SUI_USDC",
      amount: 10,
      side: "sell",
      pay_with_deep: true,
    });
    assert.equal(parsed.pool_key, "SUI_USDC");
    assert.equal(parsed.amount, 10);
    assert.equal(parsed.side, "sell");
    assert.equal(parsed.pay_with_deep, true);
    assert.equal(parsed.slippage_bps, 100);
  });

  it("parseDeepBookSwapParams rejects invalid side", () => {
    assert.throws(
      () =>
        parseDeepBookSwapParams({
          amount: 1,
          side: "hold",
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("estimateSwapNotionalSui converts USDC using pool price", () => {
    assert.equal(estimateSwapNotionalSui("USDC", 21, 2.1), 10);
    assert.equal(estimateSwapNotionalSui("SUI", 5, null), 5);
  });
});

describe("swap approval", () => {
  afterEach(() => {
    clearPendingTransactionsForTests();
  });

  it("auto-approves small SUI sells at or below threshold", () => {
    assert.equal(
      swapRequiresApproval({
        chain_id: "sui",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 10, side: "sell" },
      }),
      false,
    );
  });

  it("requires approval for large SUI sells", () => {
    assert.equal(
      swapRequiresApproval({
        chain_id: "sui",
        action: "deepbook_swap",
        params: { pool_key: "SUI_USDC", amount: 30, side: "sell" },
      }),
      true,
    );
  });

  it("transferRequiresApproval delegates swap actions", () => {
    assert.equal(
      transferRequiresApproval({
        chain_id: "sui",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 30, side: "sell" },
      }),
      true,
    );
  });

  it("creates pending swap transaction summaries", () => {
    const pending = createPendingTransaction("did:privy:swap-test", {
      chain_id: "sui",
      action: "swap",
      params: {
        pool_key: "SUI_USDC",
        amount: 30,
        side: "sell",
        estimated_out_display: 60,
      },
    });
    assert.match(pending.summary, /Swap on DeepBook/);
    assert.match(pending.amount_display, /30/);
    assert.match(pending.amount_display, /USDC/);
  });
});
