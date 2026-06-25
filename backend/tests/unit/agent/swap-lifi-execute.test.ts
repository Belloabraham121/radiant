import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import {
  buildSameChainLifiRouteParams,
  isLifiSameChainSwapEligible,
} from "../../../src/services/agent/swap/swap-lifi-execute.js";
import { parsePartialSwapIntent, withDefaultChain } from "../../../src/services/agent/swap/swap-intent-parser.js";

describe("swap-lifi-execute", () => {
  beforeEach(() => {
    process.env.ENABLED_CHAINS = "sui,solana,ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "8453,42161";
    process.env.EVM_CHAIN_IDS = "1,8453,42161";
    delete process.env.LIFI_ENABLED;
    delete process.env.LIFI_ENABLED_CHAIN_IDS;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  afterEach(() => {
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_CHAIN_IDS;
    delete process.env.LIFI_ENABLED;
    delete process.env.LIFI_ENABLED_CHAIN_IDS;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("parses Base same-chain swap intent with chain hint", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 2 USDC to ETH on base")!);
    assert.equal(intent.inputCoin, "USDC");
    assert.equal(intent.outputCoin, "ETH");
    assert.equal(intent.amount, 2);
    assert.equal(intent.chainId, "ethereum");
    assert.equal(intent.evmChainId, 8453);
  });

  it("buildSameChainLifiRouteParams uses matching from/to chain on Base", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 2 USDC to ETH on base")!);
    const params = buildSameChainLifiRouteParams(intent);

    assert.ok(params);
    assert.equal(params!.from_chain_id, "ethereum");
    assert.equal(params!.to_chain_id, "ethereum");
    assert.equal(params!.from_evm_chain_id, 8453);
    assert.equal(params!.to_evm_chain_id, 8453);
    assert.equal(params!.from_token, "USDC");
    assert.equal(params!.to_token, "ETH");
    assert.equal(params!.amount_atomic, "2000000");
  });

  it("isLifiSameChainSwapEligible for EVM with chain id and Solana", () => {
    assert.equal(
      isLifiSameChainSwapEligible(
        withDefaultChain(parsePartialSwapIntent("swap 2 USDC to ETH on base")!),
      ),
      true,
    );
    assert.equal(
      isLifiSameChainSwapEligible({
        originalMessage: "swap sol to usdc",
        chainId: "solana",
        inputCoin: "SOL",
        outputCoin: "USDC",
        amount: 1,
      }),
      true,
    );
    assert.equal(
      isLifiSameChainSwapEligible({
        originalMessage: "swap sui to usdc",
        chainId: "sui",
        inputCoin: "SUI",
        outputCoin: "USDC",
        amount: 1,
      }),
      false,
    );
  });

  it("buildSameChainLifiRouteParams matches cross_chain_routes input shape", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 2 USDC to ETH on base")!);
    const params = buildSameChainLifiRouteParams(intent);

    assert.ok(params);
    const expectedKeys = [
      "from_chain_id",
      "to_chain_id",
      "from_evm_chain_id",
      "to_evm_chain_id",
      "from_token",
      "to_token",
      "amount_atomic",
      "max_routes",
    ];
    for (const key of expectedKeys) {
      assert.ok(key in params!, `missing ${key}`);
    }
  });
});
