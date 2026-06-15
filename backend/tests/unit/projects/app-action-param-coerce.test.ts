import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceFiniteNumber,
  coercePositiveNumber,
  normalizeAppActionParams,
} from "../../../src/services/projects/app-action-param-coerce.js";

describe("app-action-param-coerce", () => {
  it("coerces string numbers", () => {
    assert.equal(coerceFiniteNumber("4.5"), 4.5);
    assert.equal(coercePositiveNumber("3.648353"), 3.648353);
    assert.equal(coercePositiveNumber("0"), undefined);
  });

  it("normalizes swap estimated_out_display from string", () => {
    const normalized = normalizeAppActionParams("swap", {
      amount: 1,
      side: "buy",
      estimated_out_display: "2.34",
    });
    assert.equal(normalized.estimated_out_display, 2.34);
  });
});
