import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMultipleOfStep,
  snapToStep,
} from "../../../src/services/defi/order-constraints.js";

describe("order-constraints", () => {
  it("treats 1.2 as a valid multiple of tick_size 0.00001", () => {
    assert.equal(isMultipleOfStep(1.2, 0.00001), true);
  });

  it("snaps arbitrary prices to the nearest tick", () => {
    assert.equal(snapToStep(1.200004, 0.00001), 1.2);
    assert.equal(snapToStep(2.345678, 0.00001), 2.34568);
  });

  it("snaps quantity to lot size", () => {
    assert.equal(snapToStep(1.14, 0.1, "nearest"), 1.1);
    assert.equal(snapToStep(1.15, 0.1, "up"), 1.2);
  });
});
