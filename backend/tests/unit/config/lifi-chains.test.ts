import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  LIFI_SOLANA_CHAIN_ID,
  LIFI_SUI_CHAIN_ID,
  getEnabledLifiChainIds,
  isLifiCrossEcosystemPair,
  radiantChainRefToLifiChainId,
  resolveLifiChainRef,
} from "../../../src/config/lifi-chains.js";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import {
  lifiToRadiantChainRef,
  toLifiTokenAddress,
} from "../../../src/services/defi/lifi/lifi-chain-map.js";
import { resolveLifiTokens } from "../../../src/services/defi/lifi/lifi-input.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("lifi-chains config", () => {
  beforeEach(() => {
    delete process.env.LIFI_ENABLED_CHAIN_IDS;
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("maps Sui and Solana Li-Fi chain ids", () => {
    assert.equal(LIFI_SUI_CHAIN_ID, 9270000000000000);
    assert.equal(LIFI_SOLANA_CHAIN_ID, 1151111081099710);
    assert.equal(
      radiantChainRefToLifiChainId({ chain_id: "sui" }),
      LIFI_SUI_CHAIN_ID,
    );
    assert.equal(
      radiantChainRefToLifiChainId({ chain_id: "solana" }),
      LIFI_SOLANA_CHAIN_ID,
    );
  });

  it("includes sui, solana, and enabled EVM ids by default", () => {
    delete process.env.LIFI_ENABLED_CHAIN_IDS;
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "42161,8453";
    process.env.EVM_CHAIN_IDS = "42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    const ids = getEnabledLifiChainIds();
    assert.ok(ids.includes(LIFI_SUI_CHAIN_ID));
    assert.ok(ids.includes(LIFI_SOLANA_CHAIN_ID));
    assert.ok(ids.includes(42161));
    assert.ok(ids.includes(8453));
    assert.ok(!ids.includes(1));
  });

  it("allows Li-Fi cross-ecosystem pairs on allowlist", () => {
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.equal(isLifiCrossEcosystemPair("sui", "ethereum"), true);
    assert.equal(isLifiCrossEcosystemPair("solana", "ethereum"), true);
    assert.equal(isLifiCrossEcosystemPair("sui", "solana"), true);
    assert.equal(isLifiCrossEcosystemPair("stellar", "ethereum"), false);
  });

  it("round-trips Li-Fi chain id to Radiant ref", () => {
    delete process.env.LIFI_ENABLED_CHAIN_IDS;
    process.env.ENABLED_CHAINS = "sui,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "8453";
    process.env.EVM_CHAIN_IDS = "8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.deepEqual(lifiToRadiantChainRef(LIFI_SUI_CHAIN_ID), { chain_id: "sui" });
    assert.deepEqual(lifiToRadiantChainRef(8453), {
      chain_id: "ethereum",
      evm_chain_id: 8453,
    });
  });
});

describe("lifi-input cross-ecosystem", () => {
  beforeEach(() => {
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "42161,8453";
    process.env.EVM_CHAIN_IDS = "42161,8453";
    process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
    process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("resolves Sui USDC to Base USDC for Li-Fi", () => {
    const tokens = resolveLifiTokens({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "USDC",
      toToken: "USDC",
    });

    assert.equal(tokens.fromSymbol, "USDC");
    assert.equal(tokens.toSymbol, "USDC");
    assert.equal(tokens.from.chain_id, "sui");
    assert.equal(tokens.to.evm_chain_id, 8453);
  });

  it("rejects stellar cross-ecosystem pairs", () => {
    assert.throws(
      () =>
        resolveLifiTokens({
          from_chain_id: "stellar",
          to_chain_id: "ethereum",
          to_evm_chain_id: 8453,
          fromToken: "USDC",
          toToken: "USDC",
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "CHAIN_NOT_ENABLED",
    );
  });

  it("maps native SUI token address for Li-Fi", () => {
    const tokens = resolveLifiTokens({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "SUI",
      toToken: "USDC",
    });

    const lifiAddress = toLifiTokenAddress(tokens.fromToken, tokens.from);
    assert.match(lifiAddress, /::sui::SUI$/);
  });
});

describe("resolveLifiChainRef", () => {
  it("defaults to ethereum when evm_chain_id provided", () => {
    assert.deepEqual(resolveLifiChainRef({ evm_chain_id: 8453 }), {
      chain_id: "ethereum",
      evm_chain_id: 8453,
    });
  });
});
