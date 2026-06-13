import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import { parseDeepBookFlashLoanParams } from "../../../src/services/defi/deepbook-flash-loan.types.js";

describe("flash loan bundle validation helpers", () => {
  it("rejects first step that does not spend borrowed asset", () => {
    assert.throws(
      () =>
        parseDeepBookFlashLoanParams({
          pool_key: "SUI_USDC",
          borrow_amount: 5,
          asset: "base",
          strategy: "swap_chain_repay",
          steps: [{ pool_key: "DEEP_USDC", side: "buy", amount: 5 }],
        }),
      (err: unknown) =>
        err instanceof AppError &&
        /First swap step must spend borrowed SUI/.test((err as AppError).message),
    );
  });

  it("rejects final step that does not output borrow asset", () => {
    assert.throws(
      () =>
        parseDeepBookFlashLoanParams({
          pool_key: "SUI_USDC",
          borrow_amount: 10000,
          asset: "quote",
          strategy: "swap_chain_repay",
          steps: [
            { pool_key: "DEEP_USDC", side: "buy", amount: 10000 },
            { pool_key: "DEEP_SUI", side: "sell", amount: 8000 },
          ],
        }),
      (err: unknown) =>
        err instanceof AppError &&
        /Final swap must output USDC/.test((err as AppError).message),
    );
  });

  it("accepts quote borrow with buy then sell route back to USDC", () => {
    const parsed = parseDeepBookFlashLoanParams({
      pool_key: "SUI_USDC",
      borrow_amount: 10000,
      asset: "quote",
      strategy: "swap_chain_repay",
      steps: [
        { pool_key: "DEEP_USDC", side: "buy", amount: 10000 },
        { pool_key: "DEEP_USDC", side: "sell", amount: 8000 },
      ],
    });
    assert.equal(parsed.coin_key, "USDC");
    assert.equal(parsed.steps?.[0].side, "buy");
    assert.equal(parsed.steps?.[1].side, "sell");
  });
});
