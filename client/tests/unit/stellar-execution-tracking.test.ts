import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStellarStreamStepPresentation,
  executionStepsForPendingApproval,
  executionStepsFromAgentTransaction,
  isInFlightStellarTransaction,
  isStellarPending,
  shouldInvalidateStellarWalletAssets,
  STELLAR_CONFIRM_RUNNING_LABEL,
  STELLAR_SUBMIT_LABEL,
} from "../../src/lib/stellar-execution-tracking";
import { mapStreamStepToExecutionStep } from "../../src/lib/chat-execution-steps";
import type { PendingTransaction } from "../../src/lib/chat-api";
import type { AgentTransactionDetail } from "../../src/lib/agent-transactions-api";

describe("stellar execution tracking", () => {
  it("detects stellar pending transactions", () => {
    const pending: PendingTransaction = {
      id: "tx-stellar",
      chain_id: "stellar",
      action: "stellar_swap",
      params: { quote_id: "soroswap:abc123" },
      summary: "Swap XLM → USDC",
      amount_display: "10 XLM → USDC",
      defi_preview: {
        kind: "swap",
        provider_id: "stellar-soroswap",
        title: "Swap XLM → USDC",
        amount_display: "10 XLM → USDC",
      },
    };

    assert.equal(isStellarPending(pending), true);
  });

  it("does not treat generic stellar transfers as soroswap pending", () => {
    const pending: PendingTransaction = {
      id: "tx-stellar-transfer",
      chain_id: "stellar",
      action: "transfer",
      params: { amount: "10000000" },
      summary: "Send XLM",
      amount_display: "1 XLM",
    };

    assert.equal(isStellarPending(pending), false);
  });

  it("returns optimistic approval steps for stellar pending", () => {
    const pending: PendingTransaction = {
      id: "tx-stellar",
      chain_id: "stellar",
      action: "stellar_swap",
      params: {},
      summary: "Swap XLM → USDC",
      amount_display: "10 XLM → USDC",
      defi_preview: {
        kind: "swap",
        provider_id: "stellar-soroswap",
        title: "Swap XLM → USDC",
        amount_display: "10 XLM → USDC",
        route_summary: "XLM → USDC",
      },
    };

    const steps = executionStepsForPendingApproval(pending);
    assert.equal(steps[0]?.id, "soroswap-quote");
    assert.equal(steps[1]?.id, "stellar-build");
    assert.equal(steps[2]?.id, "stellar-sign");
    assert.equal(steps[2]?.status, "warning");
  });

  it("keeps confirm running when tx success but effects are pending", () => {
    const tx: AgentTransactionDetail = {
      id: "tx-stellar",
      status: "success",
      category: "swap",
      chain_id: "stellar",
      title: "Swap on Stellar (XLM → USDC)",
      amount_display: "10 XLM → USDC",
      digest: "abc123def4567890",
      effects_status: "pending",
      params: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const steps = executionStepsFromAgentTransaction(tx, {
      soroswap: {
        tx_hash: "abc123def4567890",
        tracking_status: "success",
        quote_id: "soroswap:abc123",
      },
    });

    assert.equal(steps!.find((step) => step.id === "stellar-confirm")?.status, "running");
  });

  it("builds submit/confirm steps from soroswap agent transaction result", () => {
    const tx: AgentTransactionDetail = {
      id: "tx-stellar",
      status: "submitted",
      category: "swap",
      chain_id: "stellar",
      title: "Swap on Stellar (XLM → USDC)",
      amount_display: "10 XLM → USDC",
      digest: "abc123def4567890",
      effects_status: "pending",
      params: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const steps = executionStepsFromAgentTransaction(tx, {
      soroswap: {
        tx_hash: "abc123def4567890",
        tracking_status: "pending",
        quote_id: "soroswap:abc123",
      },
    });

    assert.ok(steps);
    assert.equal(steps!.find((step) => step.id === "stellar-submit")?.label, STELLAR_SUBMIT_LABEL);
    assert.equal(
      steps!.find((step) => step.id === "stellar-confirm")?.label,
      STELLAR_CONFIRM_RUNNING_LABEL,
    );
    assert.equal(steps!.find((step) => step.id === "stellar-confirm")?.status, "running");
  });

  it("marks in-flight stellar transactions while effects are pending", () => {
    assert.equal(
      isInFlightStellarTransaction({
        id: "tx-stellar",
        status: "submitted",
        category: "swap",
        chain_id: "stellar",
        title: "Swap on Stellar (XLM → USDC)",
        amount_display: "10 XLM → USDC",
        effects_status: "pending",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      true,
    );
  });

  it("invalidates wallet assets after stellar confirm succeeds", () => {
    assert.equal(
      shouldInvalidateStellarWalletAssets([
        {
          id: "stellar-confirm",
          status: "ok",
          label: "Complete",
          chainId: "stellar",
        },
      ]),
      true,
    );
    assert.equal(
      shouldInvalidateStellarWalletAssets([
        {
          id: "stellar-confirm",
          status: "running",
          label: STELLAR_CONFIRM_RUNNING_LABEL,
          chainId: "stellar",
        },
      ]),
      false,
    );
  });

  it("maps streamed stellar steps to client ids and labels", () => {
    const mapped = mapStreamStepToExecutionStep({
      id: "stellar_routing_fallback_offered",
      status: "running",
      label: "Checking Stellar option…",
    });
    assert.equal(mapped.id, "stellar-routing-offer");
    assert.equal(mapped.status, "pending");

    const quote = mapStreamStepToExecutionStep({
      id: "soroswap_quote",
      status: "running",
      label: "Getting Stellar quote…",
    });
    assert.equal(quote.id, "soroswap-quote");
    assert.equal(quote.label, "Getting Stellar quote…");

    const confirm = applyStellarStreamStepPresentation({
      id: "stellar_confirm",
      status: "running",
      label: "Confirming…",
    });
    assert.equal(confirm?.label, STELLAR_CONFIRM_RUNNING_LABEL);
  });
});
