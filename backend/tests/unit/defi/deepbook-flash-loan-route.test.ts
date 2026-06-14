import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enumerateFirstSwapStepCandidates,
  rankSwapChainRouteScores,
} from "../../../src/services/defi/deepbook/deepbook-flash-loan-route.js";

describe("deepbook-flash-loan-route", () => {
  it("enumerateFirstSwapStepCandidates includes USDC spend routes", () => {
    const candidates = enumerateFirstSwapStepCandidates({
      pool_key: "SUI_USDC",
      coin_key: "USDC",
      borrow_amount: 8000,
      asset: "quote",
    });

    assert.ok(candidates.length > 0);
    assert.ok(
      candidates.some(
        (step) => step.pool_key === "SUI_USDC" && step.side === "buy" && step.amount === 8000,
      ),
    );
  });

  it("rankSwapChainRouteScores prefers feasible routes with higher surplus", () => {
    const best = rankSwapChainRouteScores([
      { steps: [{ pool_key: "A", side: "buy", amount: 100 }], repay_feasible: false, estimated_surplus: -5 },
      { steps: [{ pool_key: "B", side: "buy", amount: 100 }], repay_feasible: true, estimated_surplus: 2 },
      { steps: [{ pool_key: "C", side: "buy", amount: 100 }], repay_feasible: true, estimated_surplus: 10 },
    ]);

    assert.equal(best?.steps[0]?.pool_key, "C");
  });
});
