import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  validateExecuteTransactionInput,
} from "../../../src/services/agent/validate-execute-transaction.js";

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
});
