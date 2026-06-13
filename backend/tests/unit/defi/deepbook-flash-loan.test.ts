import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  isDeepBookFlashLoanAction,
  parseDeepBookFlashLoanParams,
} from "../../../src/services/defi/deepbook-flash-loan.service.js";
import {
  transferRequiresApprovalWithPermissions,
} from "../../../src/services/agent/transaction-approval.service.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";

describe("deepbook-flash-loan.service", () => {
  it("parseDeepBookFlashLoanParams accepts base asset by coin_key", () => {
    const parsed = parseDeepBookFlashLoanParams({
      pool_key: "SUI_USDC",
      borrow_amount: 1,
      coin_key: "SUI",
    });
    assert.equal(parsed.pool_key, "SUI_USDC");
    assert.equal(parsed.borrow_amount, 1);
    assert.equal(parsed.asset, "base");
    assert.equal(parsed.coin_key, "SUI");
    assert.equal(parsed.strategy, "round_trip");
  });

  it("parseDeepBookFlashLoanParams accepts quote asset via asset param", () => {
    const parsed = parseDeepBookFlashLoanParams({
      pool_key: "SUI_USDC",
      amount: 10,
      asset: "quote",
    });
    assert.equal(parsed.asset, "quote");
    assert.equal(parsed.coin_key, "USDC");
    assert.equal(parsed.borrow_amount, 10);
  });

  it("parseDeepBookFlashLoanParams rejects unknown strategy", () => {
    assert.throws(
      () =>
        parseDeepBookFlashLoanParams({
          pool_key: "SUI_USDC",
          borrow_amount: 1,
          asset: "base",
          strategy: "arbitrage",
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("isDeepBookFlashLoanAction matches deepbook_flash_loan", () => {
    assert.equal(isDeepBookFlashLoanAction("deepbook_flash_loan"), true);
    assert.equal(isDeepBookFlashLoanAction("swap"), false);
  });
});

describe("flash loan approval rules", () => {
  it("always requires approval even when auto-approve is enabled", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "deepbook_flash_loan",
        params: {
          pool_key: "SUI_USDC",
          borrow_amount: 1,
          asset: "base",
        },
      }),
      true,
    );
  });
});
