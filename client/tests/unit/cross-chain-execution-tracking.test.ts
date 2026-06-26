import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executionStepsForPendingApproval,
  executionStepsFromAgentTransaction,
  markFallbackOfferDeclinedInMessages,
} from "../../src/lib/cross-chain-execution-tracking";
import type { PendingTransaction } from "../../src/lib/chat-api";
import type { AgentTransactionDetail } from "../../src/lib/agent-transactions-api";

describe("cross-chain execution tracking — alternate route", () => {
  it("returns alternate-route quote label for evm-squid pending approval", () => {
    const pending: PendingTransaction = {
      id: "tx-squid",
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        provider_id: "evm-squid",
      },
      summary: "Bridge USDC → ETH",
      amount_display: "10 USDC → ETH",
      defi_preview: {
        kind: "bridge",
        provider_id: "evm-squid",
        title: "Bridge USDC → ETH",
        amount_display: "10 USDC → ETH",
        alternate_route: true,
      },
    };

    const steps = executionStepsForPendingApproval(pending);
    assert.equal(steps[0]?.id, "lifi-quote");
    assert.equal(steps[0]?.label, "Alternate route quoted");
    assert.equal(steps[1]?.id, "lifi-submit");
    assert.equal(steps[1]?.status, "running");
  });

  it("builds squid submit/bridge/complete steps from agent transaction result", () => {
    const tx: AgentTransactionDetail = {
      id: "tx-squid",
      status: "submitted",
      category: "swap",
      chain_id: "ethereum",
      title: "Bridge USDC → ETH",
      amount_display: "10 USDC → ETH",
      digest: "0xabc123",
      explorer_url: null,
      effects_status: "pending",
      session_id: "sess-1",
      message_id: "msg-1",
      created_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
      action: "cross_chain_swap",
      params: { provider_id: "evm-squid" },
      wallet_address: "0xwallet",
      workflow_step_index: null,
      result: {
        squid: {
          route_id: "squid:route-1",
          quote_id: "quote-1",
          request_id: "req-1",
          transaction_id: "0xabc123",
          tx_hashes: ["0xabc123"],
          from_chain_id: "ethereum",
          to_chain_id: "ethereum",
          from_evm_chain_id: 8453,
          to_evm_chain_id: 42161,
          estimated_duration_seconds: 120,
          bridge_started_at: "2026-01-01T00:00:10.000Z",
          tracking_status: "PENDING",
          substatus: null,
          substatus_message: "Waiting for destination",
          receiving_tx_hash: null,
        },
      },
      error_code: null,
      error_message: null,
      submitted_at: "2026-01-01T00:00:05.000Z",
    };

    const steps = executionStepsFromAgentTransaction(
      tx,
      tx.result as Record<string, unknown>,
    );

    assert.ok(steps);
    assert.equal(steps![0]?.id, "squid-quote");
    assert.equal(steps![1]?.id, "lifi-submit");
    assert.equal(steps![1]?.status, "ok");
    assert.equal(steps![2]?.id, "lifi-bridge");
    assert.equal(steps![2]?.status, "running");
  });

  it("marks fallback-offer step skipped when user declines", () => {
    const messages = [
      {
        id: "msg-1",
        executionSteps: [
          {
            id: "fallback-offer",
            status: "pending" as const,
            label: "Finding another route…",
          },
        ],
      },
    ];

    const next = markFallbackOfferDeclinedInMessages(messages);
    const step = next[0]?.executionSteps?.find((row) => row.id === "fallback-offer") as
      | { status: string; detail?: string }
      | undefined;
    assert.equal(step?.status, "skipped");
    assert.match(step?.detail ?? "", /declined/i);
  });
});
