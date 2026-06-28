import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  estimateSwapNotionalSui,
  inferSwapSide,
  parseDeepBookSwapParams,
  resetDeepBookSwapServiceForTests,
} from "../../../src/services/defi/deepbook/deepbook-swap.service.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import {
  artifactUiActionRequiresApproval,
  buildPendingTransactionPreview,
  clearPendingTransactionsForTests,
  swapRequiresApprovalWithPermissions,
  transferRequiresApprovalWithPermissions,
} from "../../../src/services/agent/transaction-approval.service.js";
import {
  mockUnitUsdPricesForAutoApproveTests,
  resetAutoApprovePriceMocksForTests,
} from "../../helpers/auto-approve-prices.js";

describe("deepbook-swap.service", () => {
  afterEach(async () => {
    resetDeepBookSwapServiceForTests();
    await clearPendingTransactionsForTests();
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
  before(() => {
    process.env.COINGECKO_API_KEY = "CG-test-key";
    mockUnitUsdPricesForAutoApproveTests();
  });

  afterEach(async () => {
    resetAutoApprovePriceMocksForTests();
    mockUnitUsdPricesForAutoApproveTests();
    await clearPendingTransactionsForTests();
  });

  it("auto-approves small SUI sells at or below threshold", async () => {
    assert.equal(
      await swapRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 10, side: "sell" },
      }),
      false,
    );
  });

  it("requires approval for large SUI sells", async () => {
    assert.equal(
      await swapRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "deepbook_swap",
        params: { pool_key: "SUI_USDC", amount: 30, side: "sell" },
      }),
      true,
    );
  });

  it("requires approval for every swap when auto-approve is disabled", async () => {
    assert.equal(
      await swapRequiresApprovalWithPermissions(
        { ...defaultAgentPermissions(), auto_approve_enabled: false },
        {
          chain_id: "sui",
          action: "swap",
          params: { pool_key: "SUI_USDC", amount: 1, side: "sell" },
        },
      ),
      true,
    );
  });

  it("transferRequiresApproval delegates swap actions", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 30, side: "sell" },
      }),
      true,
    );
  });

  it("artifact UI source always requires approval for small swaps (auto-approve bypass)", async () => {
    assert.equal(
      artifactUiActionRequiresApproval({
        chain_id: "sui",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 1, side: "sell" },
      }),
      true,
    );
    assert.equal(
      await swapRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 1, side: "sell" },
      }),
      false,
    );
  });

  it("builds pending swap transaction summaries", async () => {
    const pending = await buildPendingTransactionPreview("did:privy:swap-test", {
      chain_id: "sui",
      action: "swap",
      params: {
        pool_key: "SUI_USDC",
        amount: 30,
        side: "sell",
        estimated_out_display: 60,
        quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    assert.match(pending.summary, /Swap on DeepBook/);
    assert.match(pending.amount_display, /30/);
    assert.match(pending.amount_display, /~60/);
    assert.match(pending.amount_display, /USDC/);
    assert.ok(pending.quote_expires_at);
  });
});
