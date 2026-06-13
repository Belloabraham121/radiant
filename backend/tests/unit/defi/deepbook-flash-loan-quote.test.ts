import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBundleRepayFeasibility } from "../../../src/services/defi/deepbook/deepbook-flash-loan-quote.js";

describe("deepbook-flash-loan-quote", () => {
  it("computeBundleRepayFeasibility is true when min_out covers borrow", () => {
    assert.equal(computeBundleRepayFeasibility(10_001, 10_000, "swap_output"), true);
  });

  it("computeBundleRepayFeasibility is false when min_out is short", () => {
    assert.equal(computeBundleRepayFeasibility(9_999, 10_000, "swap_output"), false);
  });

  it("computeBundleRepayFeasibility ignores borrow amount for wallet repay", () => {
    assert.equal(computeBundleRepayFeasibility(1, 10_000, "wallet"), true);
  });
});
