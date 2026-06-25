import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearTokenBucketsForTests } from "../../../../src/infrastructure/rate-limit/token-bucket.js";
import {
  consumeLifiOutboundQuota,
  consumeLifiQuoteQuota,
  consumeLifiStatusQuota,
} from "../../../../src/services/defi/lifi/lifi-rate-limit.js";

describe("lifi-rate-limit", () => {
  afterEach(() => {
    clearTokenBucketsForTests();
  });

  it("quote quota consumes 2 outbound tokens", async () => {
    process.env.LIFI_RATE_LIMIT_CAPACITY = "2";
    process.env.LIFI_RATE_LIMIT_REFILL_MS = "60000";

    await consumeLifiQuoteQuota("user-a");
    await assert.rejects(
      () => consumeLifiOutboundQuota("user-a", 1),
      (err: Error & { code?: string }) => err.code === "LIFI_RATE_LIMITED",
    );
  });

  it("status quota limits per tx hash", async () => {
    await consumeLifiStatusQuota("user-b", "0x" + "a".repeat(64));
    await assert.rejects(
      () => consumeLifiStatusQuota("user-b", "0x" + "a".repeat(64)),
      (err: Error & { code?: string }) => err.code === "LIFI_RATE_LIMITED",
    );
  });
});
