import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetChainConfigCacheForTests } from "../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../src/config/supported-tokens.js";
import {
  getBridgeReceiveTokenOptions,
  queryBridgeCapabilities,
  shouldAutoFillBridgeReceiveToken,
} from "../../src/config/token-capabilities.js";

function enableBridgeTestChains(): void {
  process.env.ENABLED_CHAINS = "sui,ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL = "http://localhost:8545";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

function clearBridgeTestChains(): void {
  delete process.env.ENABLED_CHAINS;
  delete process.env.ENABLED_EVM_CHAIN_IDS;
  delete process.env.EVM_CHAIN_IDS;
  delete process.env.EVM_RPC_URL;
  delete process.env.EVM_RPC_URL_1;
  delete process.env.EVM_RPC_URL_42161;
  delete process.env.EVM_RPC_URL_8453;
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

describe("token-capabilities", () => {
  beforeEach(() => {
    enableBridgeTestChains();
  });

  afterEach(() => {
    clearBridgeTestChains();
  });

  it("includes ETH in Base→Arbitrum receive options", () => {
    const options = getBridgeReceiveTokenOptions(
      "ethereum",
      8453,
      "ethereum",
      42161,
      "ETH",
    );
    assert.ok(options.some((option) => option.id === "ETH"));
    assert.ok(options.some((option) => option.label.includes("same as source")));
  });

  it("auto-fills ETH receive for EVM L2→L2", () => {
    assert.equal(
      shouldAutoFillBridgeReceiveToken(
        "ETH",
        { chain_id: "ethereum", evm_chain_id: 8453 },
        { chain_id: "ethereum", evm_chain_id: 42161 },
      ),
      true,
    );
  });

  it("queryBridgeCapabilities reports auto_fill for ETH Base→Arbitrum", () => {
    const result = queryBridgeCapabilities(
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { chain_id: "ethereum", evm_chain_id: 42161 },
      "ETH",
    );
    assert.equal(result.auto_fill_receive_token, "ETH");
    assert.equal(result.cross_chain, true);
    assert.equal(result.cross_ecosystem, false);
    assert.ok(result.receive_token_options.some((entry) => entry.symbol === "ETH"));
  });

  it("does not auto-fill SUI cross-ecosystem without confirmation", () => {
    assert.equal(
      shouldAutoFillBridgeReceiveToken(
        "SUI",
        { chain_id: "sui" },
        { chain_id: "ethereum", evm_chain_id: 8453 },
      ),
      false,
    );
    const result = queryBridgeCapabilities(
      { chain_id: "sui" },
      { chain_id: "ethereum", evm_chain_id: 8453 },
      "SUI",
    );
    assert.equal(result.requires_same_token_confirmation, true);
  });
});
