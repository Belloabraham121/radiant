import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSuiRpcRateLimitError,
  suiRpcRateLimitAppError,
  withSuiRpcRetry,
} from "../../../src/infrastructure/sui/rpc-retry.js";

describe("sui rpc retry", () => {
  it("detects Too Many Requests as rate limit", () => {
    assert.equal(isSuiRpcRateLimitError(new Error("Too Many Requests")), true);
  });

  it("maps rate limit to user-facing AppError", () => {
    const err = suiRpcRateLimitAppError(new Error("Too Many Requests"));
    assert.equal(err.code, "SUI_RPC_RATE_LIMITED");
    assert.match(err.message, /Sui RPC is rate limiting/i);
  });

  it("retries then succeeds", async () => {
    let attempts = 0;
    const value = await withSuiRpcRetry(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("Too Many Requests");
      }
      return "ok";
    }, 3);
    assert.equal(value, "ok");
    assert.equal(attempts, 2);
  });
});
