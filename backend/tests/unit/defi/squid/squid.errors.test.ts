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

  it("extracts message from axios response.data.message", () => {
    const err = mapSquidError({
      response: {
        status: 400,
        data: {
          message:
            "Token is not supported for toChain: 8453 toToken: 0x833589fcd6edb6e08f4c7c32d6f84b0ae40e2b64",
        },
      },
      message: "Request failed with status code 400",
    });
    assert.equal(err.code, "SQUID_NO_ROUTE");
    assert.equal(err.statusCode, 404);
    assert.match(err.message, /Token is not supported for toChain: 8453/);
  });

  it("extracts message from axios response.data.errors array", () => {
    const err = mapSquidError({
      response: {
        status: 500,
        data: {
          errors: [{ message: "Upstream routing service unavailable" }],
        },
      },
      message: "Request failed with status code 500",
    });
    assert.equal(err.code, "SQUID_UNAVAILABLE");
    assert.equal(err.message, "Upstream routing service unavailable");
  });

  it("maps Token is not supported to SQUID_NO_ROUTE", () => {
    const err = mapSquidError({
      response: {
        status: 400,
        data: {
          message: "Token is not supported for fromChain: sui-mainnet fromToken: 0x2::sui::SUI",
        },
      },
      message: "Request failed with status code 400",
    });
    assert.equal(err.code, "SQUID_NO_ROUTE");
    assert.match(err.message, /not supported for fromChain/);
  });

  it("maps Squid low-liquidity 500 BAD_REQUEST to SQUID_NO_ROUTE", () => {
    const err = mapSquidError({
      response: {
        status: 500,
        data: {
          message: "Low liquidity, please reduce swap amount and try again",
          statusCode: 500,
          type: "BAD_REQUEST",
        },
      },
      message: "Request failed with status code 500",
    });
    assert.equal(err.code, "SQUID_NO_ROUTE");
    assert.equal(err.statusCode, 404);
    assert.match(err.message, /Low liquidity/);
  });
});
