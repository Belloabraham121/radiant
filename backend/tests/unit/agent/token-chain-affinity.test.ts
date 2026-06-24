import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import {
  collectSwapClarificationGap,
} from "../../../src/services/agent/swap/swap-clarification-gaps.js";
import { parsePartialSwapIntent, withDefaultChain } from "../../../src/services/agent/swap/swap-intent-parser.js";
import {
  detectCrossChainSwapIntent,
  getChainsForToken,
  isTokenOnChain,
  swapIntentToBridgeIntent,
} from "../../../src/services/agent/swap/token-chain-affinity.js";
import { isLifiSameChainSwapEligible } from "../../../src/services/agent/swap/swap-lifi-execute.js";

describe("token-chain-affinity", () => {
  beforeEach(() => {
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "8453,42161";
    process.env.EVM_CHAIN_IDS = "1,8453,42161";
    delete process.env.LIFI_ENABLED;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  afterEach(() => {
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_CHAIN_IDS;
    delete process.env.LIFI_ENABLED;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("getChainsForToken returns SUI only on Sui", () => {
    const chains = getChainsForToken("SUI");
    assert.equal(chains.length, 1);
    assert.equal(chains[0].chainId, "sui");
    assert.equal(chains[0].label, "Sui");
  });

  it("isTokenOnChain rejects SUI on Base", () => {
    assert.equal(isTokenOnChain("SUI", "ethereum", 8453), false);
    assert.equal(isTokenOnChain("ETH", "ethereum", 8453), true);
  });

  it("detectCrossChainSwapIntent for ETH to SUI on Base", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 1 ETH to SUI on base")!);
    const mismatch = detectCrossChainSwapIntent(intent);
    assert.ok(mismatch);
    assert.equal(mismatch!.outputToken, "SUI");
    assert.equal(mismatch!.destination.chainId, "sui");
    assert.match(mismatch!.sourceLabel, /Base/i);
  });

  it("collectSwapClarificationGap returns bridge confirm for ETH to SUI on Base", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 1 ETH to SUI on base")!);
    const gap = collectSwapClarificationGap(intent);
    assert.ok(gap);
    assert.equal(gap!.field, "bridge_confirm");
    assert.equal(gap!.interaction_type, "confirm");
    assert.match(gap!.question, /Did you mean to bridge/i);
    assert.match(gap!.question, /SUI is only on/i);
  });

  it("swapIntentToBridgeIntent maps Base ETH to Sui SUI", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 1 ETH to SUI on base")!);
    const mismatch = detectCrossChainSwapIntent(intent)!;
    const bridge = swapIntentToBridgeIntent(intent, mismatch);
    assert.equal(bridge.fromChainId, "ethereum");
    assert.equal(bridge.fromEvmChainId, 8453);
    assert.equal(bridge.toChainId, "sui");
    assert.equal(bridge.fromToken, "ETH");
    assert.equal(bridge.toToken, "SUI");
    assert.equal(bridge.amount, 1);
  });

  it("isLifiSameChainSwapEligible rejects ETH to SUI on Base", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 1 ETH to SUI on base")!);
    assert.equal(isLifiSameChainSwapEligible(intent), false);
  });

  it("does not flag same-chain Base USDC to ETH", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 2 USDC to ETH on base")!);
    assert.equal(detectCrossChainSwapIntent(intent), null);
    assert.equal(isLifiSameChainSwapEligible(intent), true);
  });
});
