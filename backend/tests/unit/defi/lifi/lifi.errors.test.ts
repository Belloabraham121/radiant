import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mapLifiError } from "../../../../src/services/defi/lifi/lifi.errors.js";
import { AppError } from "../../../../src/errors/app-error.js";
import { HTTPError } from "@lifi/sdk";

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
});
