import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  SQUID_SOLANA_CHAIN_ID,
  SQUID_SUI_CHAIN_ID,
  getEnabledSquidChainIds,
  isSquidCrossEcosystemPair,
  radiantChainRefToSquidChainId,
  resolveSquidChainRef,
} from "../../../src/config/squid-chains.js";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import {
  radiantToSquidChainId,
  squidToRadiantChainRef,
  toSquidTokenAddress,
} from "../../../src/services/defi/squid/squid-chain-map.js";
import { resolveSquidTokens } from "../../../src/services/defi/squid/squid-input.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("squid-chains config", () => {
  beforeEach(() => {
    delete process.env.SQUID_ENABLED_CHAIN_IDS;
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("maps Sui and Solana Squid chain ids", () => {
    assert.equal(SQUID_SUI_CHAIN_ID, "sui-mainnet");
    assert.equal(SQUID_SOLANA_CHAIN_ID, "solana-mainnet-beta");
    assert.equal(radiantChainRefToSquidChainId({ chain_id: "sui" }), SQUID_SUI_CHAIN_ID);
    assert.equal(
      radiantChainRefToSquidChainId({ chain_id: "solana" }),
      SQUID_SOLANA_CHAIN_ID,
    );
  });

  it("includes sui, solana, and enabled EVM ids by default", () => {
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "42161,8453";
    process.env.EVM_CHAIN_IDS = "42161,8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    const ids = getEnabledSquidChainIds();
    assert.ok(ids.includes(SQUID_SUI_CHAIN_ID));
    assert.ok(ids.includes(SQUID_SOLANA_CHAIN_ID));
    assert.ok(ids.includes("42161"));
    assert.ok(ids.includes("8453"));
    assert.ok(!ids.includes("1"));
  });

  it("allows Squid cross-ecosystem pairs on allowlist", () => {
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.equal(isSquidCrossEcosystemPair("sui", "ethereum"), true);
    assert.equal(isSquidCrossEcosystemPair("solana", "ethereum"), true);
    assert.equal(isSquidCrossEcosystemPair("sui", "solana"), true);
    assert.equal(isSquidCrossEcosystemPair("stellar", "ethereum"), false);
  });

  it("round-trips Squid chain id to Radiant ref", () => {
    process.env.ENABLED_CHAINS = "sui,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "8453";
    process.env.EVM_CHAIN_IDS = "8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.deepEqual(squidToRadiantChainRef(SQUID_SUI_CHAIN_ID), { chain_id: "sui" });
    assert.deepEqual(squidToRadiantChainRef("8453"), {
      chain_id: "ethereum",
      evm_chain_id: 8453,
    });
  });

  it("maps EVM chain id to Squid string id", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "1";
    process.env.EVM_CHAIN_IDS = "1";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();

    assert.equal(
      radiantToSquidChainId({ chain_id: "ethereum", evm_chain_id: 1 }),
      "1",
    );
  });
});

describe("squid-input cross-ecosystem", () => {
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

  it("resolves Sui USDC to Base USDC for Squid", () => {
    const tokens = resolveSquidTokens({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "USDC",
      toToken: "USDC",
      amountAtomic: "1000000",
      confirmSameToken: true,
    });

    assert.equal(tokens.fromSymbol, "USDC");
    assert.equal(tokens.toSymbol, "USDC");
    assert.equal(tokens.from.chain_id, "sui");
    assert.equal(tokens.to.evm_chain_id, 8453);
  });

  it("rejects stellar cross-ecosystem pairs", () => {
    assert.throws(
      () =>
        resolveSquidTokens({
          from_chain_id: "stellar",
          to_chain_id: "ethereum",
          to_evm_chain_id: 8453,
          fromToken: "USDC",
          toToken: "USDC",
          amountAtomic: "1000000",
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "CHAIN_NOT_ENABLED",
    );
  });

  it("maps native SUI token address for Squid", () => {
    const tokens = resolveSquidTokens({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "SUI",
      toToken: "USDC",
      amountAtomic: "2150000000",
    });

    const squidAddress = toSquidTokenAddress(tokens.fromToken, tokens.from);
    assert.match(squidAddress, /::sui::SUI$/);
  });
});

describe("resolveSquidChainRef", () => {
  it("defaults to ethereum when evm_chain_id provided", () => {
    assert.deepEqual(resolveSquidChainRef({ evm_chain_id: 8453 }), {
      chain_id: "ethereum",
      evm_chain_id: 8453,
    });
  });
});
