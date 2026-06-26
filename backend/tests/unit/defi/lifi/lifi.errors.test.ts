import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  extractLifiErrorMessage,
  mapLifiError,
  mapLifiExecuteError,
} from "../../../../src/services/defi/lifi/lifi.errors.js";
import { AppError } from "../../../../src/errors/app-error.js";
import { HTTPError, LiFiErrorCode, SDKError, TransactionError } from "@lifi/sdk";

describe("lifi.errors", () => {
  it("maps 429 to LIFI_RATE_LIMITED", () => {
    const err = mapLifiError({ status: 429, message: "rate limited" });
    assert.equal(err.code, "LIFI_RATE_LIMITED");
    assert.equal(err.statusCode, 429);
  });

  it("maps 404 to LIFI_NO_ROUTE", () => {
    const err = mapLifiError({ status: 404, message: "no route" });
    assert.equal(err.code, "LIFI_NO_ROUTE");
  });

  it("passes through AppError", () => {
    const original = new AppError(400, "VALIDATION_ERROR", "bad");
    assert.equal(mapLifiError(original), original);
  });

  it("maps HTTPError status codes", () => {
    const response = new Response(JSON.stringify({ message: "invalid" }), { status: 400 });
    const httpErr = new HTTPError(response, "https://li.quest/v1/quote", { method: "GET" });
    const err = mapLifiError(httpErr);
    assert.equal(err.code, "LIFI_VALIDATION_ERROR");
  });

  it("sanitizes could not find token Li-Fi messages", () => {
    const err = mapLifiError({
      status: 404,
      message:
        "Could not find token '0x833589fCD6eDb6E08f4c7C32D4f597b90BeA844E' on chain '8453'",
    });
    assert.equal(err.code, "LIFI_NO_ROUTE");
    assert.match(err.message, /not available for this bridge route/i);
    assert.ok(!err.message.includes("0x833589"));
  });

  it("maps SDKError TransactionError with nested cause instead of [object Object]", () => {
    const root = new Error("MoveAbort in module 0xabc::bridge::swap");
    const txErr = new TransactionError(
      LiFiErrorCode.TransactionFailed,
      "Transaction failed: [object Object]",
      root,
    );
    const sdkErr = new SDKError(txErr);

    const extracted = extractLifiErrorMessage(sdkErr);
    assert.match(extracted, /MoveAbort/i);

    const mapped = mapLifiError(sdkErr);
    assert.equal(mapped.code, "TRANSACTION_FAILED");
    assert.match(mapped.message, /bridge transaction failed/i);
    assert.ok(!mapped.message.includes("[object Object]"));
    assert.ok(!mapped.message.includes("LI.FI SDK version"));
  });

  it("strips LI.FI SDK version suffix from generic Error messages", () => {
    const err = mapLifiError(
      new Error("[TransactionError] Transaction failed: [object Object]\nLI.FI SDK version: 4.0.1"),
    );
    assert.equal(err.code, "TRANSACTION_FAILED");
    assert.ok(!err.message.includes("LI.FI SDK version"));
    assert.ok(!err.message.includes("[object Object]"));
  });

  it("mapLifiExecuteError falls back to mapAgentToolError for non-Li-Fi errors", () => {
    const err = mapLifiExecuteError(new Error("Insufficient balance for SUI coin"));
    assert.equal(err.code, "INSUFFICIENT_BALANCE");
  });

  it("mapLifiExecuteError routes SDKError through mapLifiError", () => {
    const txErr = new TransactionError(
      LiFiErrorCode.InsufficientFunds,
      "insufficient funds for gas",
    );
    const mapped = mapLifiExecuteError(new SDKError(txErr));
    assert.equal(mapped.code, "INSUFFICIENT_BALANCE");
    assert.match(mapped.message, /source token or native gas/i);
  });
});
