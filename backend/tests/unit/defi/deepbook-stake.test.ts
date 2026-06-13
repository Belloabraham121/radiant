import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDeepBookStakeAction,
  parseDeepBookStakeParams,
  parseDeepBookUnstakeParams,
} from "../../../src/services/defi/deepbook/deepbook-stake.service.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("deepbook-stake.service", () => {
  it("recognizes stake actions", () => {
    assert.equal(isDeepBookStakeAction("deepbook_stake"), true);
    assert.equal(isDeepBookStakeAction("deepbook_unstake"), true);
    assert.equal(isDeepBookStakeAction("deepbook_deposit"), false);
  });

  it("parses stake params with amount_display and pool_key", () => {
    const parsed = parseDeepBookStakeParams({
      pool_key: "SUI_USDC",
      amount_display: 50,
    });
    assert.equal(parsed.pool_key, "SUI_USDC");
    assert.equal(parsed.amount_display, 50);
  });

  it("accepts stake_amount alias", () => {
    const parsed = parseDeepBookStakeParams({
      pool_key: "DEEP_USDC",
      stake_amount: 12.5,
    });
    assert.equal(parsed.amount_display, 12.5);
  });

  it("rejects stake without amount", () => {
    assert.throws(
      () => parseDeepBookStakeParams({ pool_key: "SUI_USDC" }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("parses unstake with pool_key only", () => {
    const parsed = parseDeepBookUnstakeParams({ pool_key: "SUI_USDC" });
    assert.equal(parsed.pool_key, "SUI_USDC");
  });

  it("normalizes pool key slashes", () => {
    const parsed = parseDeepBookStakeParams({
      pool_key: "sui/usdc",
      amount: 1,
    });
    assert.equal(parsed.pool_key, "SUI_USDC");
  });
});
