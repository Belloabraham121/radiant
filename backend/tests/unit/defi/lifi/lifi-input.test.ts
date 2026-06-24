import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { AppError } from "../../../../src/errors/app-error.js";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import {
  assertBridgeDestinationToken,
  assertBridgeQuoteParams,
  resolveLifiTokens,
} from "../../../../src/services/defi/lifi/lifi-input.js";

function enableLifiChains(): void {
  process.env.ENABLED_CHAINS = "sui,ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

describe("lifi-input — destination token guard", () => {
  beforeEach(() => {
    enableLifiChains();
  });

  it("blocks cross-ecosystem same-symbol bridge without user confirmation", () => {
    assert.throws(
      () =>
        resolveLifiTokens({
          from_chain_id: "sui",
          to_chain_id: "ethereum",
          to_evm_chain_id: 8453,
          fromToken: "SUI",
          toToken: "SUI",
          amountAtomic: "2150000000",
        }),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "DESTINATION_TOKEN_REQUIRED" &&
        /Which token should you receive on Base/i.test(err.message),
    );
  });

  it("allows cross-ecosystem bridge when destination token differs", () => {
    const tokens = resolveLifiTokens({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "SUI",
      toToken: "USDC",
      amountAtomic: "2150000000",
    });

    assert.equal(tokens.fromSymbol, "SUI");
    assert.equal(tokens.toSymbol, "USDC");
  });

  it("resolves Base USDC contract address to USDC symbol", () => {
    const tokens = resolveLifiTokens({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "SUI",
      toToken: "0x833589fCD6eDb6E08f4c7C32D4f597b90BeA844E",
      amountAtomic: "2150000000",
    });

    assert.equal(tokens.toSymbol, "USDC");
  });

  it("allows cross-ecosystem same-symbol bridge with confirmSameToken flag", () => {
    assert.doesNotThrow(() =>
      assertBridgeDestinationToken({
        from: { chain_id: "sui" },
        to: { chain_id: "ethereum", evm_chain_id: 8453 },
        fromToken: "SUI",
        toToken: "SUI",
        confirmSameToken: true,
      }),
    );
  });

  it("allows EVM L2 to L1 USDC bridge with same symbol", () => {
    const tokens = resolveLifiTokens({
      from_evm_chain_id: 8453,
      to_evm_chain_id: 1,
      fromToken: "USDC",
      toToken: "USDC",
      amountAtomic: "1000000",
    });

    assert.equal(tokens.fromSymbol, "USDC");
    assert.equal(tokens.toSymbol, "USDC");
  });

  it("assertBridgeDestinationToken is a no-op for different destination symbols", () => {
    assert.doesNotThrow(() =>
      assertBridgeDestinationToken({
        from: { chain_id: "sui" },
        to: { chain_id: "ethereum", evm_chain_id: 8453 },
        fromToken: "SUI",
        toToken: "USDC",
      }),
    );
  });
});

describe("lifi-input — bridge quote params guard", () => {
  it("requires source token before quoting", () => {
    assert.throws(
      () =>
        assertBridgeQuoteParams({
          to_token: "USDC",
          amount_atomic: "1000000",
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "SOURCE_TOKEN_REQUIRED",
    );
  });

  it("requires amount before quoting", () => {
    assert.throws(
      () =>
        assertBridgeQuoteParams({
          from_token: "SUI",
          to_token: "USDC",
        }),
      (err: unknown) => err instanceof AppError && err.code === "AMOUNT_REQUIRED",
    );
  });

  it("requires destination token before quoting", () => {
    assert.throws(
      () =>
        assertBridgeQuoteParams({
          from_token: "SUI",
          amount_atomic: "2150000000",
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "DESTINATION_TOKEN_REQUIRED",
    );
  });
});
