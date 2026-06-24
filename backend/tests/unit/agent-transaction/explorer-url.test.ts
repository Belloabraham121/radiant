import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExplorerTxUrl,
  evmExplorerTxUrl,
  explorerLabelForChain,
} from "../../../src/services/agent-transaction/explorer-url.js";

describe("explorer-url", () => {
  it("builds EVM explorer URLs per chain id", () => {
    assert.equal(
      evmExplorerTxUrl(1, "0xabc"),
      "https://etherscan.io/tx/0xabc",
    );
    assert.equal(
      evmExplorerTxUrl(8453, "0xabc"),
      "https://basescan.org/tx/0xabc",
    );
    assert.equal(
      evmExplorerTxUrl(42161, "0xabc"),
      "https://arbiscan.io/tx/0xabc",
    );
  });

  it("buildExplorerTxUrl respects evm_chain_id for ethereum", () => {
    assert.equal(
      buildExplorerTxUrl("ethereum", "0xabc", 8453),
      "https://basescan.org/tx/0xabc",
    );
    assert.equal(
      buildExplorerTxUrl("solana", "sig123"),
      "https://solscan.io/tx/sig123",
    );
    assert.equal(
      buildExplorerTxUrl("stellar", "abc123"),
      "https://stellar.expert/explorer/public/tx/abc123",
    );
  });

  it("explorerLabelForChain returns chain-aware labels", () => {
    assert.equal(explorerLabelForChain("sui"), "View on Sui Explorer");
    assert.equal(explorerLabelForChain("ethereum", 8453), "View on BaseScan");
    assert.equal(explorerLabelForChain("ethereum", 42161), "View on Arbiscan");
    assert.equal(explorerLabelForChain("ethereum", 1), "View on Etherscan");
    assert.equal(explorerLabelForChain("solana"), "View on Solscan");
    assert.equal(explorerLabelForChain("stellar"), "View on Stellar Expert");
  });
});
