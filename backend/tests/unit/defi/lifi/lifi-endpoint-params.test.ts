import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import {
  formatEnabledBridgeDestinationHint,
  normalizeLifiCrossChainParams,
  resolveEvmChainIdFromLabel,
  resolveNonEvmChainIdFromLabel,
} from "../../../../src/services/defi/lifi/lifi-endpoint-params.js";
import { lifiQuoteInputSchema } from "../../../../src/services/defi/lifi/lifi.types.js";

describe("lifi-endpoint-params", () => {
  beforeEach(() => {
    process.env.ENABLED_CHAINS = "sui,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    process.env.EVM_RPC_URL_1 = "http://localhost:8545";
    process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
    process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
  });

  it("resolveEvmChainIdFromLabel maps base to 8453", () => {
    assert.equal(resolveEvmChainIdFromLabel("Base"), 8453);
    assert.equal(resolveEvmChainIdFromLabel("base"), 8453);
  });

  it("resolveEvmChainIdFromLabel picks up newly enabled EVM networks from config", () => {
    process.env.ENABLED_EVM_CHAIN_IDS = "1,8453,137";
    process.env.EVM_CHAIN_IDS = "1,8453,137";
    process.env.EVM_RPC_URL_137 = "http://localhost:8548";
    resetEvmConfigCacheForTests();

    assert.equal(resolveEvmChainIdFromLabel("polygon"), 137);
    assert.equal(resolveEvmChainIdFromLabel("Polygon"), 137);
  });

  it("resolveNonEvmChainIdFromLabel maps sui when enabled", () => {
    assert.equal(resolveNonEvmChainIdFromLabel("sui"), "sui");
  });

  it("formatEnabledBridgeDestinationHint includes non-EVM and EVM destinations", () => {
    const hint = formatEnabledBridgeDestinationHint();
    assert.match(hint, /to_chain_id sui/);
    assert.match(hint, /to_evm_chain_id 8453/);
  });

  it("normalizeLifiCrossChainParams sets to_evm_chain_id from destination_evm", () => {
    const normalized = normalizeLifiCrossChainParams({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      destination_evm: "base",
      from_token: "SUI",
      to_token: "USDC",
      amount_atomic: "2150000000",
    }) as Record<string, unknown>;

    assert.equal(normalized.to_evm_chain_id, 8453);
  });

  it("normalizeLifiCrossChainParams sets to_chain_id sui from destination label", () => {
    const normalized = normalizeLifiCrossChainParams({
      from_chain_id: "ethereum",
      from_evm_chain_id: 8453,
      destination_evm: "sui",
      from_token: "USDC",
      to_token: "SUI",
      amount_atomic: "1000000",
    }) as Record<string, unknown>;

    assert.equal(normalized.to_chain_id, "sui");
  });

  it("lifiQuoteInputSchema accepts destination_evm base for Sui to Base", () => {
    const parsed = lifiQuoteInputSchema.parse({
      from_chain_id: "sui",
      to_chain_id: "ethereum",
      destination_evm: "base",
      from_token: "SUI",
      to_token: "USDC",
      amount_atomic: "2150000000",
    });

    assert.equal(parsed.to_evm_chain_id, 8453);
  });
});
