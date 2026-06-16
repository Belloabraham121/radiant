import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearTokenBucketsForTests,
  tryConsumeTokenBucket,
} from "../../../src/infrastructure/rate-limit/token-bucket.js";

describe("token bucket", () => {
  afterEach(() => {
    clearTokenBucketsForTests();
  });

  it("allows bursts up to capacity then limits", async () => {
    const config = { capacity: 2, refillIntervalMs: 60_000 };

    assert.equal(await tryConsumeTokenBucket("test", config), true);
    assert.equal(await tryConsumeTokenBucket("test", config), true);
    assert.equal(await tryConsumeTokenBucket("test", config), false);
  });
});
