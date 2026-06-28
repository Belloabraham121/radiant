import type { AgentPermissions } from "@/lib/agent-permissions-api";
import type { PendingTransaction } from "@/lib/chat-api";

/** True when the server marked a pending tx for silent client-side approval. */
export function isServerAutoApproveEligible(
  pending: PendingTransaction | null | undefined,
): boolean {
  return pending?.auto_approve_eligible === true;
}

/** Client-side check using permissions + fiat preview (fallback when flag absent). */
export function shouldAutoApprovePending(
  pending: PendingTransaction,
  permissions: AgentPermissions,
): boolean {
  if (isServerAutoApproveEligible(pending)) {
    return true;
  }
  if (!permissions.auto_approve_enabled) {
    return false;
  }
  const payUsd = pending.fiat_preview?.total_pay_usd;
  if (payUsd === null || payUsd === undefined || !Number.isFinite(payUsd)) {
    return false;
  }
  return payUsd <= permissions.auto_approve_max_usd;
}
