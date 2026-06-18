import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RADIANT_CHARTS_TSX } from "../../../src/services/projects/radiant-charts.template.js";

describe("radiant-charts template", () => {
  it("exports OHLCV chart components", () => {
    assert.match(RADIANT_CHARTS_TSX, /export function OhlcvAreaChart/);
    assert.match(RADIANT_CHARTS_TSX, /export function extractCloseSeries/);
    assert.match(RADIANT_CHARTS_TSX, /Template v1/);
  });

  it("handles tuple and object candle shapes in extractCloseSeries source", () => {
    assert.match(RADIANT_CHARTS_TSX, /Array\.isArray\(row\)/);
    assert.match(RADIANT_CHARTS_TSX, /c\.close/);
  });
});
