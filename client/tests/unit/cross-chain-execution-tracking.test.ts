import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executionStepsForPendingApproval,
  executionStepsFromAgentTransaction,
  markFallbackOfferDeclinedInMessages,
  mergeCrossChainTransactionStepsIntoMessages,
} from "../../src/lib/cross-chain-execution-tracking";
import { normalizeExecutionSteps } from "../../src/lib/chat-execution-steps";
import type { PendingTransaction } from "../../src/lib/chat-api";
import type { AgentTransactionDetail } from "../../src/lib/agent-transactions-api";

const SOLANA_WALLET = "35tWpkpFr7UawcpuXm6ir1nN1v5tfoJgKj84xv1YukZn";

describe("cross-chain execution tracking — alternate route", () => {
  it("returns alternate-route quote label for evm-squid cross-chain pending approval", () => {
    const pending: PendingTransaction = {
      id: "tx-squid",
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 8453,
        to_evm_chain_id: 42161,
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

  it("returns route quoted label for same-chain evm-squid pending approval", () => {
    const pending: PendingTransaction = {
      id: "tx-squid-same",
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 8453,
        to_evm_chain_id: 8453,
        provider_id: "evm-squid",
      },
      summary: "Swap USDC → ETH",
      amount_display: "1.5 USDC → ETH",
      defi_preview: {
        kind: "bridge",
        provider_id: "evm-squid",
        title: "Swap USDC → ETH",
        amount_display: "1.5 USDC → ETH",
        alternate_route: true,
      },
    };

    const steps = executionStepsForPendingApproval(pending);
    assert.equal(steps[0]?.label, "Route quoted");
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
    assert.equal(steps![0]?.id, "lifi-quote");
    assert.equal(steps![1]?.id, "lifi-submit");
    assert.equal(steps![1]?.status, "ok");
    assert.equal(steps![2]?.id, "lifi-bridge");
    assert.equal(steps![2]?.status, "running");
  });

  it("marks same-chain squid swap complete when digest exists on Base", () => {
    const tx: AgentTransactionDetail = {
      id: "tx-squid-same-chain",
      status: "success",
      category: "swap",
      chain_id: "ethereum",
      title: "Swap USDC → ETH",
      amount_display: "1.5 USDC → ETH",
      digest: "0x07972f6769",
      explorer_url: null,
      effects_status: "success",
      session_id: "sess-1",
      message_id: "msg-1",
      created_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:30.000Z",
      action: "cross_chain_swap",
      params: { provider_id: "evm-squid" },
      wallet_address: "0xwallet",
      workflow_step_index: null,
      result: {
        squid: {
          route_id: "squid:route-base",
          quote_id: "quote-base",
          request_id: "req-base",
          transaction_id: "0x07972f6769",
          tx_hashes: ["0x07972f6769"],
          from_chain_id: "ethereum",
          to_chain_id: "ethereum",
          from_evm_chain_id: 8453,
          to_evm_chain_id: 8453,
          estimated_duration_seconds: 30,
          bridge_started_at: "2026-01-01T00:00:10.000Z",
          tracking_status: "SUCCESS",
          substatus: null,
          substatus_message: null,
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
    assert.equal(steps!.find((step) => step.id === "lifi-quote")?.label, "Route quoted");
    assert.equal(steps!.find((step) => step.id === "lifi-bridge")?.label, "Swapped");
    assert.equal(steps!.find((step) => step.id === "lifi-bridge")?.status, "ok");
    assert.equal(steps!.find((step) => step.id === "lifi-complete")?.status, "ok");
    assert.equal(
      steps!.filter((step) => step.id === "lifi-quote").length,
      1,
    );
  });

  it("builds chainflip deposit steps for Solana squid route", () => {
    const tx: AgentTransactionDetail = {
      id: "tx-squid-chainflip",
      status: "submitted",
      category: "swap",
      chain_id: "solana",
      title: "Bridge SOL → USDC",
      amount_display: "0.1 SOL → USDC",
      digest: "sol-deposit-tx-1",
      explorer_url: null,
      effects_status: "pending",
      session_id: "sess-1",
      message_id: "msg-1",
      created_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
      action: "cross_chain_swap",
      params: { provider_id: "evm-squid" },
      wallet_address: SOLANA_WALLET,
      workflow_step_index: null,
      result: {
        squid: {
          route_id: "squid:route-chainflip",
          quote_id: "quote-chainflip",
          request_id: null,
          transaction_id: "5994435-Solana-26351",
          tx_hashes: ["sol-deposit-tx-1"],
          from_chain_id: "solana",
          to_chain_id: "ethereum",
          to_evm_chain_id: 8453,
          estimated_duration_seconds: 180,
          bridge_started_at: "2026-01-01T00:00:10.000Z",
          tracking_status: "PENDING",
          substatus: null,
          substatus_message: null,
          receiving_tx_hash: null,
          bridge_type: "chainflipmultihop",
          chainflip_status_tracking_id: "5994435-Solana-26351",
          chainflip_deposit: {
            deposit_address: "Dep0s1tAddr3551111111111111111111111111111",
            amount: "100000000",
            chainflip_status_tracking_id: "5994435-Solana-26351",
            bridge_type: "chainflipmultihop",
          },
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
    assert.equal(steps!.find((step) => step.id === "squid-deposit-address")?.status, "ok");
    assert.equal(steps!.find((step) => step.id === "squid-deposit-send")?.label, "Sending to bridge…");
    assert.equal(steps!.find((step) => step.id === "lifi-submit")?.label, "Deposit submitted");
    assert.equal(steps!.find((step) => step.id === "lifi-bridge")?.status, "running");
  });

  it("optimistic chainflip approval includes deposit steps", () => {
    const pending: PendingTransaction = {
      id: "tx-chainflip-pending",
      chain_id: "solana",
      action: "cross_chain_swap",
      params: {
        from_chain_id: "solana",
        to_chain_id: "ethereum",
        provider_id: "evm-squid",
        squid_route: {
          quoteId: "quote-chainflip",
          transactionRequest: { type: "CHAINFLIP_DEPOSIT_ADDRESS", request: {} },
        },
      },
      summary: "Bridge SOL → USDC",
      amount_display: "0.1 SOL → USDC",
      defi_preview: {
        kind: "bridge",
        provider_id: "evm-squid",
        title: "Bridge SOL → USDC",
        amount_display: "0.1 SOL → USDC",
        alternate_route: true,
      },
    };

    const steps = executionStepsForPendingApproval(pending);
    assert.equal(steps.find((step) => step.id === "squid-deposit-address")?.status, "running");
    assert.equal(steps.find((step) => step.id === "squid-deposit-send")?.status, "pending");
  });

  it("collapses duplicate cross-chain step ids after approve hydration merge", () => {
    const tx: AgentTransactionDetail = {
      id: "tx-squid",
      status: "submitted",
      category: "swap",
      chain_id: "ethereum",
      title: "Bridge USDC → ETH",
      amount_display: "10 USDC → ETH",
      digest: "0xbridge123",
      explorer_url: null,
      effects_status: "pending",
      session_id: "sess-1",
      message_id: "msg-bridge",
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
          transaction_id: "0xbridge123",
          tx_hashes: ["0xbridge123"],
          from_chain_id: "ethereum",
          to_chain_id: "ethereum",
          from_evm_chain_id: 8453,
          to_evm_chain_id: 1,
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

    const messages = [
      {
        id: "msg-bridge",
        executionSteps: [
          {
            id: "fallback-offer",
            status: "ok" as const,
            label: "Finding another route…",
          },
          {
            id: "lifi-quote",
            status: "ok" as const,
            label: "Alternate route quoted",
          },
          {
            id: "lifi-quote",
            status: "ok" as const,
            label: "Alternate route quoted",
          },
          {
            id: "lifi-submit",
            status: "running" as const,
            label: "Submitting",
            agentTransactionId: "tx-squid",
          },
        ],
      },
      {
        id: "msg-other",
        executionSteps: [
          {
            id: "lifi-quote",
            status: "ok" as const,
            label: "Route quoted",
            agentTransactionId: "tx-squid",
          },
        ],
      },
    ];

    const merged = mergeCrossChainTransactionStepsIntoMessages(
      messages,
      [tx],
      new Map([[tx.id, tx]]),
    );

    const bridgeSteps = merged.find((message) => message.id === "msg-bridge")?.executionSteps ?? [];
    const otherSteps = merged.find((message) => message.id === "msg-other")?.executionSteps ?? [];

    assert.equal(bridgeSteps.filter((step) => step.id === "lifi-quote").length, 1);
    assert.equal(bridgeSteps.filter((step) => step.id === "lifi-submit").length, 1);
    assert.equal(bridgeSteps.filter((step) => step.id === "lifi-bridge").length, 1);
    assert.equal(otherSteps.length, 1);
    assert.equal(otherSteps[0]?.agentTransactionId, "tx-squid");
  });

  it("normalizeExecutionSteps collapses squid-quote into lifi-quote", () => {
    const normalized = normalizeExecutionSteps([
      { id: "squid-quote", status: "ok", label: "Alternate route quoted" },
      { id: "lifi-quote", status: "ok", label: "Route quoted" },
      { id: "lifi-submit", status: "running", label: "Submitting" },
    ]);

    assert.equal(normalized.filter((step) => step.id === "lifi-quote").length, 1);
    assert.equal(normalized.find((step) => step.id === "squid-quote"), undefined);
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
