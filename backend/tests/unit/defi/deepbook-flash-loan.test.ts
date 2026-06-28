import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  isDeepBookFlashLoanAction,
  parseDeepBookFlashLoanParams,
} from "../../../src/services/defi/deepbook/deepbook-flash-loan.service.js";
import { parseDeepBookFlashLoanParams as parseFromTypes } from "../../../src/services/defi/deepbook/deepbook-flash-loan.types.js";
import {
  flashLoanRequiresApproval,
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

  it("parseDeepBookFlashLoanParams accepts swap_chain_repay with 2 steps", () => {
    const parsed = parseFromTypes({
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      asset: "quote",
      strategy: "swap_chain_repay",
      steps: [
        { pool_key: "DEEP_USDC", side: "buy", amount: 10000 },
        { pool_key: "DEEP_USDC", side: "sell", amount: 500 },
      ],
    });
    assert.equal(parsed.strategy, "swap_chain_repay");
    assert.equal(parsed.steps?.length, 2);
    assert.equal(parsed.repay_source, "swap_output");
    assert.equal(parsed.slippage_bps, 100);
  });

  it("parseDeepBookFlashLoanParams rejects steps on round_trip", () => {
    assert.throws(
      () =>
        parseDeepBookFlashLoanParams({
          pool_key: "SUI_USDC",
          borrow_amount: 1,
          asset: "base",
          strategy: "round_trip",
          steps: [{ pool_key: "DEEP_USDC", side: "sell", amount: 1 }],
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
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
  const baseInput = {
    chain_id: "sui" as const,
    action: "deepbook_flash_loan",
    params: {
      pool_key: "SUI_USDC",
      borrow_amount: 1,
      asset: "base",
      strategy: "round_trip",
    },
  };

  it("requires approval when flash loans disabled", () => {
    assert.equal(
      flashLoanRequiresApproval(
        { ...defaultAgentPermissions(), allow_flash_loans: false },
        baseInput,
      ),
      true,
    );
  });

  it("requires approval when allow on but auto off", () => {
    assert.equal(
      flashLoanRequiresApproval(
        { ...defaultAgentPermissions(), allow_flash_loans: true, auto_approve_flash_loans: false },
        baseInput,
      ),
      true,
    );
  });

  it("skips approval when allow on, auto on, swap_output repay", () => {
    assert.equal(
      flashLoanRequiresApproval(
        { ...defaultAgentPermissions(), allow_flash_loans: true, auto_approve_flash_loans: true },
        baseInput,
      ),
      false,
    );
  });

  it("always requires approval for wallet repay", () => {
    assert.equal(
      flashLoanRequiresApproval(
        {
          ...defaultAgentPermissions(),
          allow_flash_loans: true,
          auto_approve_flash_loans: true,
        },
        {
          ...baseInput,
          params: {
            ...baseInput.params,
            strategy: "swap_chain_repay",
            repay_source: "wallet",
            steps: [{ pool_key: "DEEP_USDC", side: "sell", amount: 1 }],
          },
        },
      ),
      true,
    );
  });

  it("transferRequiresApprovalWithPermissions delegates flash loans", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(
        { ...defaultAgentPermissions(), allow_flash_loans: true, auto_approve_flash_loans: true },
        baseInput,
      ),
      false,
    );
  });
});
