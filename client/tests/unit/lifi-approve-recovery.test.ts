import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../../src/lib/api";
import {
  isApproveConsumedInFlight,
  isApproveRequestTimeout,
  isLifiAgentTransaction,
  resolveApproveCatchOutcome,
  shouldRestorePendingAfterApproveError,
} from "../../src/lib/lifi-approve-recovery";
import type { AgentTransactionDetail } from "../../src/lib/agent-transactions-api";

function detail(
  overrides: Partial<AgentTransactionDetail>,
): AgentTransactionDetail {
  return {
    id: "tx-1",
    status: "submitted",
    category: "other",
    chain_id: "ethereum",
    title: "Bridge",
    amount_display: "1 USDC",
    digest: "0xabc",
    explorer_url: null,
    effects_status: "pending",
    session_id: "s-1",
    message_id: "m-1",
    created_at: new Date().toISOString(),
    completed_at: null,
    action: "cross_chain_swap",
    params: { route_id: "r1" },
    wallet_address: "0x1",
    workflow_step_index: null,
    result: null,
    error_code: null,
    error_message: null,
    submitted_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("lifi-approve-recovery", () => {
  it("restores pending only when server row is still pending_approval", () => {
    assert.equal(
      shouldRestorePendingAfterApproveError(
        detail({ status: "pending_approval" }),
        "tx-1",
      ),
      true,
    );
    assert.equal(
      shouldRestorePendingAfterApproveError(detail({ status: "submitted" }), "tx-1"),
      false,
    );
    assert.equal(
      shouldRestorePendingAfterApproveError(detail({ status: "success" }), "tx-1"),
      false,
    );
  });

  it("detects approve HTTP timeouts", () => {
    assert.equal(
      isApproveRequestTimeout(new ApiError(504, "UPSTREAM_TIMEOUT", "timed out")),
      true,
    );
    assert.equal(
      isApproveRequestTimeout(
        new ApiError(504, "UPSTREAM_TIMEOUT", "Approval is still processing."),
      ),
      true,
    );
    assert.equal(
      isApproveRequestTimeout(new ApiError(400, "QUOTE_EXPIRED", "expired")),
      false,
    );
  });

  it("detects Li-Fi transactions across chain types", () => {
    assert.equal(isLifiAgentTransaction(detail({ action: "cross_chain_swap" })), true);
    assert.equal(isLifiAgentTransaction(detail({ action: "transfer_eth", params: {} })), false);
    assert.equal(
      isLifiAgentTransaction(detail({ action: "swap", params: { route_id: "x" } })),
      true,
    );
  });

  it("treats submitted Li-Fi rows as in-flight after approval claim", () => {
    assert.equal(
      isApproveConsumedInFlight(
        detail({ status: "submitted", effects_status: null }),
        "tx-1",
      ),
      true,
    );
    assert.equal(
      isApproveConsumedInFlight(
        detail({ status: "submitted", effects_status: "pending", chain_id: "sui" }),
        "tx-1",
      ),
      true,
    );
    assert.equal(
      isApproveConsumedInFlight(
        detail({ status: "failure", error_message: "Insufficient balance" }),
        "tx-1",
      ),
      false,
    );
  });

  it("resolves approve catch without error banner when bridge is in flight", () => {
    const outcome = resolveApproveCatchOutcome(
      detail({ status: "submitted", effects_status: "pending" }),
      "tx-1",
      true,
      "upstream timeout",
    );
    assert.equal(outcome.kind, "in_flight");
    assert.equal(outcome.message, null);
  });

  it("surfaces friendly failure when execute already failed", () => {
    const outcome = resolveApproveCatchOutcome(
      detail({
        status: "failure",
        error_message: "Not enough ETH for gas.",
      }),
      "tx-1",
      true,
      "upstream timeout",
    );
    assert.equal(outcome.kind, "failed");
    assert.equal(outcome.message, "Not enough ETH for gas.");
  });
});
