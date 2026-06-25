import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import { AppError } from "../../../src/errors/app-error.js";
import {
  assertCrossEcosystemSupported,
  filterEnabledEvmChainIds,
  getSupportedChains,
  resetSupportedTokensCacheForTests,
  resolveTokenSymbol,
  validateTokenAllowed,
} from "../../../src/config/supported-tokens.js";

describe("supported-tokens", () => {
  afterEach(() => {
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_CHAIN_IDS;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetDeepBookEnvForTests();
    resetSupportedTokensCacheForTests();
  });

  it("getSupportedChains expands ethereum to enabled EVM networks", () => {
    process.env.ENABLED_CHAINS = "sui,ethereum,stellar";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();

    const chains = getSupportedChains();
    const evmEntries = chains.filter((entry) => entry.chain_id === "ethereum");
    assert.equal(evmEntries.length, 3);
    assert.deepEqual(
      evmEntries.map((entry) => entry.evm_chain_id).sort((a, b) => (a ?? 0) - (b ?? 0)),
      [1, 8453, 42161],
    );
    assert.ok(chains.some((entry) => entry.chain_id === "sui"));
    assert.ok(chains.some((entry) => entry.chain_id === "stellar"));
  });

  it("filterEnabledEvmChainIds removes Polygon", () => {
    process.env.EVM_CHAIN_IDS = "1,137,42161,8453";
    resetEvmConfigCacheForTests();

    assert.deepEqual(filterEnabledEvmChainIds([1, 137, 42161, 8453, 10]), [1, 42161, 8453]);
  });

  it("resolveTokenSymbol exact match for USDC on Base", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    const result = resolveTokenSymbol("ethereum", "USDC", 8453);
    assert.equal(result.match, "exact");
    if (result.match === "exact") {
      assert.equal(result.symbol, "USDC");
      assert.equal(result.evm_chain_id, 8453);
      assert.equal(result.token.address, "0x833589fCD6eDb6E08f4c7C32D4f597b90BeA844E");
    }
  });

  it("resolveTokenSymbol resolves Base USDC by contract address", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    const result = resolveTokenSymbol(
      "ethereum",
      "0x833589fCD6eDb6E08f4c7C32D4f597b90BeA844E",
      8453,
    );
    assert.equal(result.match, "exact");
    if (result.match === "exact") {
      assert.equal(result.symbol, "USDC");
    }
  });

  it("resolveTokenSymbol fuzzy suggests USDC for shot", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    const result = resolveTokenSymbol("ethereum", "shot", 8453);
    assert.equal(result.match, "fuzzy");
    if (result.match === "fuzzy") {
      assert.equal(result.executable, false);
      assert.ok(result.suggestions.some((entry) => entry.symbol === "USDC"));
    }
  });

  it("resolveTokenSymbol throws TOKEN_NOT_RECOGNIZED for long nonsense", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.throws(
      () => resolveTokenSymbol("ethereum", "xxxyyy", 8453),
      (err: unknown) => err instanceof AppError && err.code === "TOKEN_NOT_RECOGNIZED",
    );
  });

  it("resolveTokenSymbol throws TOKEN_NOT_SUPPORTED for ARB on Base", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.throws(
      () => resolveTokenSymbol("ethereum", "ARB", 8453),
      (err: unknown) => err instanceof AppError && err.code === "TOKEN_NOT_SUPPORTED",
    );
  });

  it("resolveTokenSymbol throws TOKEN_AMBIGUOUS for ETH without evm_chain_id", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.throws(
      () => resolveTokenSymbol("ethereum", "ETH"),
      (err: unknown) => err instanceof AppError && err.code === "TOKEN_AMBIGUOUS",
    );
  });

  it("validateTokenAllowed accepts SUI on sui", () => {
    process.env.ENABLED_CHAINS = "sui";
    resetChainConfigCacheForTests();

    assert.equal(validateTokenAllowed("sui", "SUI"), true);
  });

  it("assertCrossEcosystemSupported rejects stellar to ethereum", () => {
    assert.throws(
      () => assertCrossEcosystemSupported("stellar", "ethereum"),
      (err: unknown) =>
        err instanceof AppError && err.code === "CROSS_ECOSYSTEM_NOT_SUPPORTED",
    );
  });
});
