import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStellarRpcRateLimitError,
  stellarRpcRateLimitAppError,
  withStellarRpcRetry,
} from "../../../src/infrastructure/stellar/rpc-retry.js";

describe("stellar rpc retry", () => {
  it("detects Too Many Requests as rate limit", () => {
    assert.equal(isStellarRpcRateLimitError(new Error("Too Many Requests")), true);
  });

  it("maps rate limit to user-facing AppError", () => {
    const err = stellarRpcRateLimitAppError(new Error("Too Many Requests"));
    assert.equal(err.code, "STELLAR_RPC_RATE_LIMITED");
    assert.match(err.message, /Stellar RPC is rate limiting/i);
  });

  it("retries then succeeds", async () => {
    let attempts = 0;
    const value = await withStellarRpcRetry(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("429 rate limit");
      }
      return "ok";
    }, 3);
    assert.equal(value, "ok");
    assert.equal(attempts, 2);
  });
});
