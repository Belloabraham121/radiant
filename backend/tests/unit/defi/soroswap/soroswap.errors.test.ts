import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractSoroswapErrorMessage,
  mapSoroswapError,
  mapSoroswapExecuteError,
  sanitizeMessage,
} from "../../../../src/services/defi/soroswap/soroswap.errors.js";
import { isStellarRoutingFallbackEligible } from "../../../../src/services/defi/soroswap/stellar-routing-fallback.js";
import { AppError } from "../../../../src/errors/app-error.js";
import type { rpc } from "@stellar/stellar-sdk";

describe("soroswap.errors", () => {
  it("sanitizeMessage redacts API keys and Authorization headers", () => {
    const sanitized = sanitizeMessage(
      "Authorization Bearer sk_live_abc123 failed with Bearer sk_live_abc123",
    );
    assert.doesNotMatch(sanitized, /sk_live_abc123/);
    assert.match(sanitized, /\[redacted\]/);
  });

  it("maps 429 to SOROSWAP_RATE_LIMITED", () => {
    const err = mapSoroswapError({ status: 429, message: "rate limited" });
    assert.equal(err.code, "SOROSWAP_RATE_LIMITED");
    assert.equal(err.statusCode, 429);
  });

  it("maps 404 / no route to SOROSWAP_ROUTE_NOT_FOUND", () => {
    const err = mapSoroswapError({ status: 404, message: "no route found" });
    assert.equal(err.code, "SOROSWAP_ROUTE_NOT_FOUND");
    assert.equal(err.statusCode, 404);
  });

  it("maps insufficient liquidity heuristics to SOROSWAP_ROUTE_NOT_FOUND", () => {
    const err = mapSoroswapError({ status: 400, message: "Insufficient liquidity for amount" });
    assert.equal(err.code, "SOROSWAP_ROUTE_NOT_FOUND");
  });

  it("maps 401/403 to SOROSWAP_UNAUTHORIZED", () => {
    const err = mapSoroswapError({ status: 403, message: "invalid api key" });
    assert.equal(err.code, "SOROSWAP_UNAUTHORIZED");
  });

  it("maps validation errors to SOROSWAP_VALIDATION_ERROR", () => {
    const err = mapSoroswapError({ status: 400, message: "validation failed: amount required" });
    assert.equal(err.code, "SOROSWAP_VALIDATION_ERROR");
  });

  it("maps expired quote at build to SOROSWAP_QUOTE_EXPIRED", () => {
    const err = mapSoroswapError({ status: 400, message: "Quote expired" });
    assert.equal(err.code, "SOROSWAP_QUOTE_EXPIRED");
  });

  it("maps 5xx to SOROSWAP_UNAVAILABLE", () => {
    const err = mapSoroswapError({ status: 503, message: "upstream down" });
    assert.equal(err.code, "SOROSWAP_UNAVAILABLE");
    assert.equal(err.statusCode, 503);
  });

  it("passes through AppError", () => {
    const original = new AppError(400, "VALIDATION_ERROR", "bad");
    assert.equal(mapSoroswapError(original), original);
  });

  it("extracts axios-shaped response.data.message", () => {
    const message = extractSoroswapErrorMessage({
      response: {
        status: 400,
        data: { message: "unknown asset XYZ" },
      },
    });
    assert.match(message, /unknown asset/i);
  });

  it("mapSoroswapExecuteError delegates trustline simulation errors to Stellar mapper", () => {
    const err = mapSoroswapExecuteError(new Error("Simulation failed: op_no_trust"));
    assert.equal(err.code, "INSUFFICIENT_BALANCE");
    assert.match(err.message, /trustline/i);
  });

  it("mapSoroswapExecuteError delegates unfunded account simulation errors", () => {
    const err = mapSoroswapExecuteError(new Error("Simulation failed: op_no_account"));
    assert.equal(err.code, "INSUFFICIENT_BALANCE");
  });

  it("mapSoroswapExecuteError delegates Soroban submit trustline failures", () => {
    const response = {
      status: "ERROR",
      hash: "abc123",
      errorResult: {
        result: () => ({
          switch: () => ({ name: "op_no_trust" }),
        }),
      },
    } as unknown as rpc.Api.SendTransactionResponse;

    const err = mapSoroswapExecuteError(response);
    assert.equal(err.code, "INSUFFICIENT_BALANCE");
  });

  it("mapSoroswapExecuteError maps slippage simulation failures", () => {
    const err = mapSoroswapExecuteError(new Error("Slippage tolerance exceeded on simulate"));
    assert.equal(err.code, "SLIPPAGE_EXCEEDED");
  });

  it("mapSoroswapExecuteError maps Soroswap HTTP errors on execute path", () => {
    const err = mapSoroswapExecuteError({ status: 400, message: "quote expired" });
    assert.equal(err.code, "SOROSWAP_QUOTE_EXPIRED");
  });
});

describe("stellar-routing-fallback", () => {
  it("is eligible for CROSS_ECOSYSTEM_NOT_SUPPORTED", () => {
    const err = new AppError(400, "CROSS_ECOSYSTEM_NOT_SUPPORTED", "not supported");
    assert.equal(isStellarRoutingFallbackEligible(err), true);
  });

  it("is ineligible for SOROSWAP_RATE_LIMITED", () => {
    const err = new AppError(429, "SOROSWAP_RATE_LIMITED", "limited");
    assert.equal(isStellarRoutingFallbackEligible(err), false);
  });

  it("is ineligible for INSUFFICIENT_BALANCE", () => {
    const err = new AppError(400, "INSUFFICIENT_BALANCE", "fund wallet");
    assert.equal(isStellarRoutingFallbackEligible(err), false);
  });
});
