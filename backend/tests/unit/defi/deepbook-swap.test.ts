import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  estimateSwapNotionalSui,
  inferSwapSide,
  parseDeepBookSwapParams,
  resetDeepBookSwapServiceForTests,
} from "../../../src/services/defi/deepbook-swap.service.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import {
  clearPendingTransactionsForTests,
  createPendingTransaction,
  swapRequiresApprovalWithPermissions,
  transferRequiresApprovalWithPermissions,
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

  it("infers sell side from SUI to USDC coins", () => {
    const side = inferSwapSide(
      { input_coin: "SUI", output_coin: "USDC" },
      { pool_key: "SUI_USDC", base_coin: "SUI", quote_coin: "USDC" },
    );
    assert.equal(side, "sell");
  });

  it("parseDeepBookSwapParams infers side when coins are provided", () => {
    const parsed = parseDeepBookSwapParams({
      pool_key: "SUI_USDC",
      amount: 1,
      input_coin: "SUI",
      output_coin: "USDC",
    });
    assert.equal(parsed.side, "sell");
    assert.equal(parsed.amount, 1);
    assert.equal(parsed.pay_with_deep, false);
  });

  it("defaults pay_with_deep to false unless explicitly true", () => {
    const parsed = parseDeepBookSwapParams({
      pool_key: "SUI_USDC",
      amount: 1,
      side: "sell",
    });
    assert.equal(parsed.pay_with_deep, false);
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
      swapRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 10, side: "sell" },
      }),
      false,
    );
  });

  it("requires approval for large SUI sells", () => {
    assert.equal(
      swapRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "deepbook_swap",
        params: { pool_key: "SUI_USDC", amount: 30, side: "sell" },
      }),
      true,
    );
  });

  it("requires approval for every swap when auto-approve is disabled", () => {
    assert.equal(
      swapRequiresApprovalWithPermissions(
        { auto_approve_enabled: false, auto_approve_max_sui: 100 },
        {
          chain_id: "sui",
          action: "swap",
          params: { pool_key: "SUI_USDC", amount: 1, side: "sell" },
        },
      ),
      true,
    );
  });

  it("transferRequiresApproval delegates swap actions", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
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
