import { apiFetch } from "@/lib/api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { PendingTransaction } from "@/lib/chat-api";
import {
  sortExecutionSteps,
  upsertExecutionStep,
  type ExecutionStep,
} from "@/lib/chat-execution-steps";

export type StellarRoutingFallbackStatus = "offered" | "accepted" | "rejected" | "expired";

/** Snapshot offered when tokens are Stellar-only but user selected another chain. */
export type StellarRoutingFallbackOffer = {
  fallback_offer_id: string;
  status: StellarRoutingFallbackStatus;
  selected_chain_id: AgentChainId;
  selected_evm_chain_id?: number;
  token_in: string;
  token_out: string;
  amount: string;
  trade_type?: "EXACT_IN" | "EXACT_OUT";
  slippage?: number;
  offered_at: string;
  expires_at: string;
  primary_error_code?: string;
};

export type AcceptStellarRoutingFallbackResult = {
  status: "approval_required";
  pending: PendingTransaction;
  agent_transaction_id: string;
  quote_id: string;
};

export type RejectStellarRoutingFallbackResult = {
  status: "rejected";
  fallback_offer_id: string;
};

export function isStellarRoutingFallbackPending(
  pending: PendingTransaction | null | undefined,
): pending is PendingTransaction & {
  approval_outcome: "stellar_routing_fallback_offered";
  stellar_routing_fallback_offer: StellarRoutingFallbackOffer;
} {
  return (
    pending?.approval_outcome === "stellar_routing_fallback_offered" &&
    Boolean(pending.stellar_routing_fallback_offer?.fallback_offer_id)
  );
}

export async function acceptStellarRoutingFallback(
  offerId: string,
): Promise<AcceptStellarRoutingFallbackResult> {
  return apiFetch<AcceptStellarRoutingFallbackResult>(
    `/api/v1/agent/transactions/stellar-routing-fallback/${offerId}/accept`,
    { method: "POST" },
  );
}

export async function rejectStellarRoutingFallback(
  offerId: string,
): Promise<RejectStellarRoutingFallbackResult> {
  return apiFetch<RejectStellarRoutingFallbackResult>(
    `/api/v1/agent/transactions/stellar-routing-fallback/${offerId}/reject`,
    { method: "POST" },
  );
}

/** Mark the Stellar routing offer step skipped when the user declines. */
export function markStellarRoutingOfferDeclinedInMessages<
  T extends { executionSteps?: ExecutionStep[] },
>(messages: T[]): T[] {
  return messages.map((message) => {
    const steps = message.executionSteps;
    if (!steps?.some((step) => step.id === "stellar-routing-offer")) {
      return message;
    }
    const next = sortExecutionSteps(
      upsertExecutionStep(steps, {
        id: "stellar-routing-offer",
        status: "skipped",
        label: "Checking Stellar option…",
        detail: "Stellar swap declined",
      }),
    );
    return { ...message, executionSteps: next };
  });
}
