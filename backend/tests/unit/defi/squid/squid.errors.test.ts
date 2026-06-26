import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSquidError } from "../../../../src/services/defi/squid/squid.errors.js";
import { AppError } from "../../../../src/errors/app-error.js";

describe("squid.errors", () => {
  it("maps 429 to SQUID_RATE_LIMITED", () => {
    const err = mapSquidError({ status: 429, message: "rate limited" });
    assert.equal(err.code, "SQUID_RATE_LIMITED");
    assert.equal(err.statusCode, 429);
  });

  it("maps 404 to SQUID_NO_ROUTE", () => {
    const err = mapSquidError({ status: 404, message: "no route" });
    assert.equal(err.code, "SQUID_NO_ROUTE");
  });

  it("maps 400 to SQUID_VALIDATION_ERROR", () => {
    const err = mapSquidError({ status: 400, message: "invalid params" });
    assert.equal(err.code, "SQUID_VALIDATION_ERROR");
  });

  it("maps 5xx to SQUID_UNAVAILABLE", () => {
    const err = mapSquidError({ status: 503, message: "down" });
    assert.equal(err.code, "SQUID_UNAVAILABLE");
    assert.equal(err.statusCode, 503);
  });

  it("passes through AppError", () => {
    const original = new AppError(400, "VALIDATION_ERROR", "bad");
    assert.equal(mapSquidError(original), original);
  });

  it("maps axios-style 429 errors", () => {
    const err = mapSquidError({
      response: { status: 429 },
      message: "Too Many Requests",
    });
    assert.equal(err.code, "SQUID_RATE_LIMITED");
  });

  it("maps no route message heuristics", () => {
    const err = mapSquidError(new Error("Route not found for pair"));
    assert.equal(err.code, "SQUID_NO_ROUTE");
  });
});
