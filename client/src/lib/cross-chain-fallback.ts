import { apiFetch } from "@/lib/api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { PendingTransaction } from "@/lib/chat-api";

export type CrossChainFallbackStatus = "offered" | "accepted" | "rejected" | "expired";

/** Snapshot offered when Li-Fi has no liquidity and user may opt into an alternate route. */
export type LiquidityFallbackOffer = {
  fallback_offer_id: string;
  status: CrossChainFallbackStatus;
  from_chain_id: AgentChainId;
  to_chain_id: AgentChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  from_token: string;
  to_token: string;
  amount_atomic: string;
  slippage?: number;
  confirm_same_token?: boolean;
  offered_at: string;
  expires_at: string;
  primary_error_code?: string;
};

export type AcceptLiquidityFallbackResult = {
  status: "approval_required";
  pending: PendingTransaction;
  agent_transaction_id: string;
};

export type RejectLiquidityFallbackResult = {
  status: "rejected";
  fallback_offer_id: string;
};

export function isLiquidityFallbackPending(
  pending: PendingTransaction | null | undefined,
): pending is PendingTransaction & {
  approval_outcome: "liquidity_fallback_offered";
  liquidity_fallback_offer: LiquidityFallbackOffer;
} {
  return (
    pending?.approval_outcome === "liquidity_fallback_offered" &&
    Boolean(pending.liquidity_fallback_offer?.fallback_offer_id)
  );
}

export function isAlternateCrossChainRoute(pending: PendingTransaction): boolean {
  return (
    pending.defi_preview?.provider_id === "evm-squid" ||
    pending.defi_preview?.alternate_route === true ||
    pending.params.provider_id === "evm-squid"
  );
}

export async function acceptLiquidityFallback(
  offerId: string,
): Promise<AcceptLiquidityFallbackResult> {
  return apiFetch<AcceptLiquidityFallbackResult>(
    `/api/v1/agent/transactions/liquidity-fallback/${offerId}/accept`,
    { method: "POST" },
  );
}

export async function rejectLiquidityFallback(
  offerId: string,
): Promise<RejectLiquidityFallbackResult> {
  return apiFetch<RejectLiquidityFallbackResult>(
    `/api/v1/agent/transactions/liquidity-fallback/${offerId}/reject`,
    { method: "POST" },
  );
}
