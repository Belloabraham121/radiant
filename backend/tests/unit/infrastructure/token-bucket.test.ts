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

  it("refills after the interval even under frequent denied retries (no starvation)", async () => {
    const realNow = Date.now;
    let nowMs = 1_000_000;
    Date.now = () => nowMs;
    try {
      const config = { capacity: 1, refillIntervalMs: 1000 };

      // Drain the only token.
      assert.equal(await tryConsumeTokenBucket("starve", config), true);

      // Hammer denied attempts faster than the refill interval. The old code
      // rewrote lastRefillMs = now on each denial, discarding accrued time and
      // starving the bucket indefinitely.
      nowMs += 300;
      assert.equal(await tryConsumeTokenBucket("starve", config), false);
      nowMs += 300;
      assert.equal(await tryConsumeTokenBucket("starve", config), false);
      nowMs += 300;
      assert.equal(await tryConsumeTokenBucket("starve", config), false);

      // A full interval has now elapsed since the token was consumed → refilled.
      nowMs += 200;
      assert.equal(await tryConsumeTokenBucket("starve", config), true);
    } finally {
      Date.now = realNow;
    }
  });
});
