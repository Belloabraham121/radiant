import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  assertSoroswapTokenPair,
  getSoroswapAllowedSymbols,
  isSoroswapAllowedSymbol,
} from "../../../src/config/soroswap-chains.js";
import { isSoroswapEnabled } from "../../../src/config/soroswap.js";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("soroswap-chains config", () => {
  beforeEach(() => {
    delete process.env.ENABLED_CHAINS;
    process.env.ENABLED_CHAINS = "sui,ethereum,stellar";
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("returns XLM and USDC from supported-tokens stellar allowlist", () => {
    const symbols = getSoroswapAllowedSymbols();
    assert.ok(symbols.includes("XLM"));
    assert.ok(symbols.includes("USDC"));
    assert.equal(isSoroswapAllowedSymbol("xlm"), true);
    assert.equal(isSoroswapAllowedSymbol("SUI"), false);
  });

  it("assertSoroswapTokenPair accepts valid pairs", () => {
    assert.doesNotThrow(() => assertSoroswapTokenPair("XLM", "USDC"));
    assert.doesNotThrow(() => assertSoroswapTokenPair("USDC", "XLM"));
  });

  it("assertSoroswapTokenPair rejects identical tokens", () => {
    assert.throws(
      () => assertSoroswapTokenPair("XLM", "XLM"),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("assertSoroswapTokenPair rejects unknown symbols", () => {
    assert.throws(
      () => assertSoroswapTokenPair("XLM", "SUI"),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () => assertSoroswapTokenPair("ETH", "USDC"),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });
});

describe("isSoroswapEnabled", () => {
  beforeEach(() => {
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
  });

  it("requires SOROSWAP_ENABLED=true and a non-empty API key", () => {
    assert.equal(isSoroswapEnabled(), false);

    process.env.SOROSWAP_ENABLED = "true";
    assert.equal(isSoroswapEnabled(), false);

    process.env.SOROSWAP_API_KEY = "test-key";
    assert.equal(isSoroswapEnabled(), true);

    process.env.SOROSWAP_ENABLED = "false";
    assert.equal(isSoroswapEnabled(), false);
  });
});
