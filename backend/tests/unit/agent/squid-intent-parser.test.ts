import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import {
  detectSquidTestMode,
  isSquidIntentTestEnabled,
  messageLooksLikeSquidTestIntent,
  stripSquidTestPrefix,
} from "../../../src/services/agent/squid-test/squid-intent-parser.js";

function enableSquidTestEnv(): void {
  process.env.SQUID_ENABLED = "true";
  process.env.SQUID_INTEGRATOR_ID = "radiant-test";
  process.env.SQUID_INTENT_TEST_ENABLED = "true";
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

function clearSquidTestEnv(): void {
  delete process.env.SQUID_ENABLED;
  delete process.env.SQUID_INTEGRATOR_ID;
  delete process.env.SQUID_INTENT_TEST_ENABLED;
  delete process.env.ENABLED_CHAINS;
  delete process.env.ENABLED_EVM_CHAIN_IDS;
  delete process.env.EVM_CHAIN_IDS;
  delete process.env.EVM_RPC_URL_1;
  delete process.env.EVM_RPC_URL_42161;
  delete process.env.EVM_RPC_URL_8453;
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

describe("squid-intent-parser", () => {
  beforeEach(() => {
    enableSquidTestEnv();
  });

  afterEach(() => {
    clearSquidTestEnv();
  });

  it("isSquidIntentTestEnabled requires SQUID_INTENT_TEST_ENABLED and Squid config", () => {
    assert.equal(isSquidIntentTestEnabled(), true);
    delete process.env.SQUID_INTENT_TEST_ENABLED;
    assert.equal(isSquidIntentTestEnabled(), false);
    process.env.SQUID_INTENT_TEST_ENABLED = "true";
    delete process.env.SQUID_INTEGRATOR_ID;
    assert.equal(isSquidIntentTestEnabled(), false);
  });

  it("detects squid bridge and swap prefixes", () => {
    assert.equal(messageLooksLikeSquidTestIntent("squid bridge 100 USDC from ethereum to base"), true);
    assert.equal(messageLooksLikeSquidTestIntent("squid swap 50 USDC to ETH on base"), true);
    assert.equal(detectSquidTestMode("squid bridge from sui to solana"), "bridge");
    assert.equal(detectSquidTestMode("squid swap usdc to sui"), "swap");
  });

  it("ignores messages without squid prefix or when disabled", () => {
    assert.equal(messageLooksLikeSquidTestIntent("bridge 100 USDC from ethereum to base"), false);
    assert.equal(messageLooksLikeSquidTestIntent("squid hello there"), false);
    delete process.env.SQUID_INTENT_TEST_ENABLED;
    assert.equal(messageLooksLikeSquidTestIntent("squid bridge 100 USDC"), false);
  });

  it("stripSquidTestPrefix removes leading squid token", () => {
    assert.equal(
      stripSquidTestPrefix("squid bridge 100 USDC from ethereum to base"),
      "bridge 100 usdc from ethereum to base",
    );
    assert.equal(
      stripSquidTestPrefix("squid swap 10 eth to usdc on arbitrum"),
      "swap 10 eth to usdc on arbitrum",
    );
    assert.equal(stripSquidTestPrefix("bridge without squid"), "bridge without squid");
  });
});
