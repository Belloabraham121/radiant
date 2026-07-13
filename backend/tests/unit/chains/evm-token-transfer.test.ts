import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import { AppError } from "../../../src/errors/app-error.js";
import {
  isEvmTokenTransferAction,
  readEvmTransferTokenParam,
  resolveEvmTransferToken,
} from "../../../src/services/wallet/evm-transaction.service.js";
import { estimateExecuteTransactionUsd } from "../../../src/services/market/valuation.service.js";

function resetCaches(): void {
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

describe("evm token transfer", () => {
  beforeEach(() => {
    process.env.ENABLED_CHAINS = "sui,ethereum";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetCaches();
  });

  afterEach(() => {
    delete process.env.ENABLED_CHAINS;
    delete process.env.EVM_CHAIN_IDS;
    resetCaches();
  });

  it("isEvmTokenTransferAction matches transfer_token and transfer_erc20", () => {
    assert.equal(isEvmTokenTransferAction("transfer_token"), true);
    assert.equal(isEvmTokenTransferAction("transfer_erc20"), true);
    assert.equal(isEvmTokenTransferAction("transfer_eth"), false);
  });

  it("readEvmTransferTokenParam accepts token aliases", () => {
    assert.equal(readEvmTransferTokenParam({ token: "USDC" }), "USDC");
    assert.equal(readEvmTransferTokenParam({ token_symbol: "WETH" }), "WETH");
    assert.throws(
      () => readEvmTransferTokenParam({}),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("resolves USDC on Base with decimals and contract address", () => {
    const resolved = resolveEvmTransferToken({ token: "USDC" }, 8453);
    assert.equal(resolved.symbol, "USDC");
    assert.equal(resolved.token.kind, "erc20");
    assert.equal(resolved.token.decimals, 6);
    assert.equal(
      resolved.token.address?.toLowerCase(),
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase(),
    );
  });

  it("resolves a token by ERC-20 contract address", () => {
    const resolved = resolveEvmTransferToken(
      { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
      8453,
    );
    assert.equal(resolved.symbol, "USDC");
    assert.equal(resolved.token.kind, "erc20");
  });

  it("resolves ETH as a native token", () => {
    const resolved = resolveEvmTransferToken({ token: "ETH" }, 1);
    assert.equal(resolved.token.kind, "native");
    assert.equal(resolved.token.decimals, 18);
  });

  it("requires evm_chain_id when the symbol exists on multiple networks", () => {
    assert.throws(
      () => resolveEvmTransferToken({ token: "USDC" }),
      (err: unknown) => err instanceof AppError && err.code === "TOKEN_AMBIGUOUS",
    );
  });

  it("resolves ARB without evm_chain_id — it only exists on Arbitrum", () => {
    const resolved = resolveEvmTransferToken({ token: "ARB" });
    assert.equal(resolved.symbol, "ARB");
    assert.equal(resolved.evm_chain_id, 42161);
  });

  it("rejects fuzzy token matches instead of executing them", () => {
    assert.throws(
      () => resolveEvmTransferToken({ token: "USSDC" }, 8453),
      (err: unknown) => err instanceof AppError && err.code === "TOKEN_NOT_RECOGNIZED",
    );
  });

  it("estimates USD for a stablecoin transfer_token without network calls", async () => {
    const usd = await estimateExecuteTransactionUsd({
      chain_id: "ethereum",
      action: "transfer_token",
      params: { token: "USDC", recipient: "0x" + "a".repeat(40), amount_display: 5, evm_chain_id: 8453 },
    });
    assert.equal(usd, 5);
  });

  it("estimates USD from atomic stablecoin amounts using token decimals", async () => {
    const usd = await estimateExecuteTransactionUsd({
      chain_id: "ethereum",
      action: "transfer_token",
      params: {
        token: "USDC",
        recipient: "0x" + "a".repeat(40),
        amount_atomic: "2500000",
        evm_chain_id: 8453,
      },
    });
    assert.equal(usd, 2.5);
  });

  it("fails closed (null USD → approval) when the token is unknown", async () => {
    const usd = await estimateExecuteTransactionUsd({
      chain_id: "ethereum",
      action: "transfer_token",
      params: { token: "NOPE", recipient: "0x" + "a".repeat(40), amount_display: 5 },
    });
    assert.equal(usd, null);
  });
});
