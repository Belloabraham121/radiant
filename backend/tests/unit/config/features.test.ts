import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getFeatureFlags,
  isFeatureEnabled,
} from "../../../src/config/features.js";

describe("features config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults canvas to disabled when env is unset", () => {
    delete process.env.FEATURE_CANVAS_ENABLED;
    assert.deepEqual(getFeatureFlags(), { canvas: false });
    assert.equal(isFeatureEnabled("canvas"), false);
  });

  it("enables canvas only when env is true (case-insensitive)", () => {
    process.env.FEATURE_CANVAS_ENABLED = "TRUE";
    assert.equal(getFeatureFlags().canvas, true);
    assert.equal(isFeatureEnabled("canvas"), true);
  });

  it("keeps canvas disabled for non-true env values", () => {
    process.env.FEATURE_CANVAS_ENABLED = "false";
    assert.equal(getFeatureFlags().canvas, false);

    process.env.FEATURE_CANVAS_ENABLED = "1";
    assert.equal(getFeatureFlags().canvas, false);

    process.env.FEATURE_CANVAS_ENABLED = " yes ";
    assert.equal(getFeatureFlags().canvas, false);
  });
});
