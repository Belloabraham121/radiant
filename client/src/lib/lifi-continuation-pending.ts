import type {
  AgentTransactionDetail,
  AgentTransactionListItem,
} from "@/lib/agent-transactions-api";
import { getAgentTransaction } from "@/lib/agent-transactions-api";
import type { PendingTransaction } from "@/lib/chat-api";
import type { AgentChainId } from "@/lib/agent-chains";

export function isLifiContinuationApproval(params: Record<string, unknown>): boolean {
  if (params.lifi_continuation === true) {
    return true;
  }
  const kind = params.approval_kind;
  return kind === "lifi_continue" || kind === "lifi_continuation";
}

export function isLifiContinuationPendingTx(
  detail: AgentTransactionDetail,
): boolean {
  if (detail.status !== "pending_approval") {
    return false;
  }
  return isLifiContinuationApproval(detail.params);
}

export function pendingTransactionFromAgentDetail(
  detail: AgentTransactionDetail,
): PendingTransaction | null {
  if (detail.status !== "pending_approval") {
    return null;
  }

  const isContinuation = isLifiContinuationApproval(detail.params);

  return {
    id: detail.id,
    chain_id: detail.chain_id as AgentChainId,
    action: detail.action,
    params: detail.params,
    summary: detail.title,
    amount_display: detail.amount_display,
    quote_expires_at: isContinuation
      ? null
      : typeof detail.params.quote_expires_at === "string"
        ? detail.params.quote_expires_at
        : typeof detail.params.expires_at === "string"
          ? detail.params.expires_at
          : null,
  };
}

/** Prefer the most recent claimable Li-Fi continuation pending approval. */
export function pickClaimableLifiContinuationPending(
  details: AgentTransactionDetail[],
): AgentTransactionDetail | null {
  const matches = details
    .filter(isLifiContinuationPendingTx)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  return matches[0] ?? null;
}

export async function loadClaimableLifiContinuationPending(
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
    if (!isLifiContinuationPendingTx(detail)) {
      continue;
    }
    return pendingTransactionFromAgentDetail(detail);
  }

  return null;
}
