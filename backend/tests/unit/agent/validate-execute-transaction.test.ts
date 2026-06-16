import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  validateExecuteTransactionInput,
} from "../../../src/services/agent/deepbook/validate-execute-transaction.js";

describe("validateExecuteTransactionInput", () => {
  it("rejects deepbook_deposit without an amount", () => {
    assert.throws(
      () =>
        validateExecuteTransactionInput({
          chain_id: "sui",
          action: "deepbook_deposit",
          params: { coin_key: "SUI" },
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("accepts deepbook_provision_manager with empty params", () => {
    assert.doesNotThrow(() =>
      validateExecuteTransactionInput({
        chain_id: "sui",
        action: "deepbook_provision_manager",
        params: {},
      }),
    );
  });

  it("accepts deepbook_deposit with amount_display", () => {
    assert.doesNotThrow(() =>
      validateExecuteTransactionInput({
        chain_id: "sui",
        action: "deepbook_deposit",
        params: { coin_key: "SUI", amount_display: 0.5 },
      }),
    );
  });

  it("rejects deepbook_margin_deposit without amount", () => {
    assert.throws(
      () =>
        validateExecuteTransactionInput({
          chain_id: "sui",
          action: "deepbook_margin_deposit",
          params: { margin_manager_key: "default", coin_type: "quote" },
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("accepts deepbook_provision_margin_manager with pool_key", () => {
    assert.doesNotThrow(() =>
      validateExecuteTransactionInput({
        chain_id: "sui",
        action: "deepbook_provision_margin_manager",
        params: { pool_key: "SUI_USDC" },
      }),
    );
  });

  it("rejects deepbook_provision_margin_manager without pool_key", () => {
    assert.throws(
      () =>
        validateExecuteTransactionInput({
          chain_id: "sui",
          action: "deepbook_provision_margin_manager",
          params: {},
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });
});
