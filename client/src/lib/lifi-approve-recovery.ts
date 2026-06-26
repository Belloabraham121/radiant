import type { AgentTransactionDetail } from "@/lib/agent-transactions-api";
import { ApiError } from "@/lib/api";
import { sanitizeToolErrorMessage } from "@/lib/sanitize-tool-error";

/** Only restore the approval bar when the server still has this tx pending approval. */
export function shouldRestorePendingAfterApproveError(
  detail: AgentTransactionDetail,
  transactionId: string,
): boolean {
  return detail.id === transactionId && detail.status === "pending_approval";
}

export function isApproveRequestTimeout(err: unknown): boolean {
  if (!(err instanceof ApiError)) {
    return false;
  }
  if (err.status === 504 || err.code === "UPSTREAM_TIMEOUT") {
    return true;
  }
  return /timed out|took too long|still processing/i.test(err.message);
}

export function messageForApproveInFlightError(timeout: boolean): string {
  if (timeout) {
    return (
      "Approval is still processing. Watch the execution timeline below — " +
      "don't approve again unless a new prompt appears."
    );
  }
  return (
    "Could not confirm approval yet. Check the execution timeline — " +
    "if the bridge is already running, wait for it to finish."
  );
}

const LIFI_EXECUTE_ACTIONS = new Set(["cross_chain_swap", "lifi_approve"]);

export function isLifiAgentTransaction(
  tx: Pick<AgentTransactionDetail, "action" | "params">,
): boolean {
  if (LIFI_EXECUTE_ACTIONS.has(tx.action)) {
    return true;
  }
  const params = tx.params ?? {};
  return (
    typeof params.lifi_route === "object" ||
    typeof params.route === "object" ||
    typeof params.route_id === "string" ||
    params.provider_id === "evm-squid"
  );
}

/** Approval was claimed and execution/bridge is still running (any Li-Fi chain). */
export function isApproveConsumedInFlight(
  detail: AgentTransactionDetail,
  transactionId: string,
): boolean {
  if (detail.id !== transactionId || detail.status === "failure") {
    return false;
  }
  if (detail.status === "submitted") {
    if (detail.effects_status === "pending") {
      return true;
    }
    // Claimed for execute; Li-Fi meta may not be persisted yet (EVM, Sui, Solana, etc.).
    if (
      isLifiAgentTransaction(detail) &&
      detail.effects_status !== "success" &&
      detail.effects_status !== "failure"
    ) {
      return true;
    }
    return false;
  }
  return detail.status === "success" && detail.effects_status === "pending";
}

export type ApproveCatchOutcome =
  | { kind: "restore_pending"; message: string }
  | { kind: "in_flight"; message: null }
  | { kind: "failed"; message: string }
  | { kind: "uncertain"; message: string };

export function resolveApproveCatchOutcome(
  detail: AgentTransactionDetail,
  transactionId: string,
  timedOut: boolean,
  fallbackMessage: string,
): ApproveCatchOutcome {
  if (shouldRestorePendingAfterApproveError(detail, transactionId)) {
    return { kind: "restore_pending", message: fallbackMessage };
  }

  if (detail.status === "failure") {
    const raw = detail.error_message?.trim() || fallbackMessage || "Transaction failed. Try again.";
    return {
      kind: "failed",
      message: sanitizeToolErrorMessage(raw),
    };
  }

  if (isApproveConsumedInFlight(detail, transactionId)) {
    return { kind: "in_flight", message: null };
  }

  if (timedOut) {
    return {
      kind: "uncertain",
      message: messageForApproveInFlightError(false),
    };
  }

  return { kind: "uncertain", message: fallbackMessage };
}
