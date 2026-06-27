import type {
  AgentTransactionDetail,
  AgentTransactionListItem,
} from "@/lib/agent-transactions-api";
import { getAgentTransaction } from "@/lib/agent-transactions-api";
import type { PendingTransaction } from "@/lib/chat-api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { StellarRoutingFallbackOffer } from "@/lib/stellar-routing-fallback";
import { isStellarPending } from "@/lib/stellar-execution-tracking";

function readQuoteExpiresAt(params: Record<string, unknown>): string | null {
  if (typeof params.quote_expires_at === "string") {
    return params.quote_expires_at;
  }
  if (typeof params.expires_at === "string") {
    return params.expires_at;
  }
  return null;
}

function readStellarRoutingFallbackOffer(
  params: Record<string, unknown>,
): StellarRoutingFallbackOffer | undefined {
  const offer = params.stellar_routing_fallback_offer;
  if (!offer || typeof offer !== "object") {
    return undefined;
  }
  return offer as StellarRoutingFallbackOffer;
}

export function isStellarRoutingFallbackPendingTx(
  detail: AgentTransactionDetail,
): boolean {
  if (detail.status !== "pending_approval") {
    return false;
  }
  return (
    detail.params.approval_outcome === "stellar_routing_fallback_offered" &&
    Boolean(readStellarRoutingFallbackOffer(detail.params)?.fallback_offer_id)
  );
}

export function isSoroswapApprovalPendingTx(detail: AgentTransactionDetail): boolean {
  if (detail.status !== "pending_approval") {
    return false;
  }
  if (isStellarRoutingFallbackPendingTx(detail)) {
    return false;
  }

  const pending: PendingTransaction = {
    id: detail.id,
    chain_id: detail.chain_id,
    action: detail.action,
    params: detail.params,
    summary: detail.title,
    amount_display: detail.amount_display,
  };

  return isStellarPending(pending);
}

export function pendingTransactionFromAgentDetail(
  detail: AgentTransactionDetail,
): PendingTransaction | null {
  if (detail.status !== "pending_approval") {
    return null;
  }

  const fallbackOffer = readStellarRoutingFallbackOffer(detail.params);
  const approvalOutcome = detail.params.approval_outcome;

  return {
    id: detail.id,
    chain_id: detail.chain_id as AgentChainId,
    action: detail.action,
    params: detail.params,
    summary: detail.title,
    amount_display: detail.amount_display,
    quote_expires_at: readQuoteExpiresAt(detail.params),
    ...(approvalOutcome === "stellar_routing_fallback_offered"
      ? {
          approval_outcome: "stellar_routing_fallback_offered" as const,
          stellar_routing_fallback_offer: fallbackOffer,
        }
      : isSoroswapApprovalPendingTx(detail)
        ? { approval_outcome: "approval_required" as const }
        : {}),
    ...(fallbackOffer ? { stellar_routing_fallback_offer: fallbackOffer } : {}),
  };
}

/** Restore Stellar routing fallback or Soroswap approval pendings after reload. */
export async function loadClaimableStellarContinuationPending(
  items: AgentTransactionListItem[],
): Promise<PendingTransaction | null> {
  const pendingRows = items
    .filter((item) => item.status === "pending_approval")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  for (const row of pendingRows) {
    const detail = await getAgentTransaction(row.id);
    if (!isStellarRoutingFallbackPendingTx(detail) && !isSoroswapApprovalPendingTx(detail)) {
      continue;
    }
    return pendingTransactionFromAgentDetail(detail);
  }

  return null;
}
