import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executionStepsForPendingApproval,
  optimisticApprovalMessageId,
} from "../../src/lib/lifi-execution-tracking";
import type { PendingTransaction } from "../../src/lib/chat-api";

describe("executionStepsForPendingApproval", () => {
  it("returns Li-Fi steps for cross_chain_swap", () => {
    const pending: PendingTransaction = {
      id: "tx-1",
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 8453,
        to_evm_chain_id: 8453,
        bridges: ["1inch"],
      },
      summary: "Swap USDC to ETH on Base",
      amount_display: "10 USDC → ETH",
      defi_preview: {
        kind: "swap",
        provider_id: "evm-lifi",
        title: "Swap",
        amount_display: "10 USDC → ETH",
        pay: { symbol: "USDC", amount_display: "10" },
        receive: { symbol: "ETH", amount_display: "0.01" },
      },
    };

    const steps = executionStepsForPendingApproval(pending);
    assert.equal(steps.length, 2);
    assert.equal(steps[0]?.id, "lifi-quote");
    assert.equal(steps[0]?.status, "ok");
    assert.equal(steps[1]?.id, "lifi-submit");
    assert.equal(steps[1]?.status, "running");
    assert.equal(steps[1]?.agentTransactionId, "tx-1");
    assert.equal(steps[1]?.evmChainId, 8453);
  });

  it("returns execute step for DeepBook swap", () => {
    const pending: PendingTransaction = {
      id: "tx-2",
      chain_id: "sui",
      action: "deepbook_swap",
      params: {},
      summary: "Swap SUI to USDC",
      amount_display: "1 SUI → USDC",
    };

    const steps = executionStepsForPendingApproval(pending);
    assert.equal(steps.length, 1);
    assert.equal(steps[0]?.id, "execute");
    assert.equal(steps[0]?.status, "running");
    assert.equal(steps[0]?.label, "Swapping");
  });
});

describe("optimisticApprovalMessageId", () => {
  it("prefixes transaction id", () => {
    assert.equal(
      optimisticApprovalMessageId("abc-123"),
      "optimistic-approval-abc-123",
    );
  });
});
