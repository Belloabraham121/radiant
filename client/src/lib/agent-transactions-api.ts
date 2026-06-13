import { apiFetch } from "@/lib/api";
import type { AgentChainId } from "@/lib/agent-chains";

export type AgentTransactionStatus =
  | "pending_approval"
  | "rejected"
  | "expired"
  | "submitted"
  | "success"
  | "failure";

export type AgentTransactionCategory =
  | "swap"
  | "transfer"
  | "deepbook_balance"
  | "deepbook_order"
  | "deepbook_cancel"
  | "deepbook_modify"
  | "deepbook_settled"
  | "flash_loan"
  | "stake"
  | "governance"
  | "other";

export type AgentTransactionListItem = {
  id: string;
  status: AgentTransactionStatus;
  category: AgentTransactionCategory;
  chain_id: AgentChainId;
  title: string;
  amount_display: string;
  digest: string | null;
  effects_status: string | null;
  session_id: string | null;
  message_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AgentTransactionDetail = AgentTransactionListItem & {
  action: string;
  params: Record<string, unknown>;
  wallet_address: string;
  workflow_step_index: number | null;
  result: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  submitted_at: string | null;
  explorer_url: string | null;
};

export type ListAgentTransactionsQuery = {
  page?: number;
  limit?: number;
  status?: AgentTransactionStatus;
  category?: AgentTransactionCategory;
  chain_id?: AgentChainId;
  session_id?: string;
};

type PaginatedAgentTransactionsResponse = {
  items: AgentTransactionListItem[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  };
};

export async function listAgentTransactions(
  query: ListAgentTransactionsQuery = {},
): Promise<PaginatedAgentTransactionsResponse> {
  const params = new URLSearchParams();
  if (query.page != null) params.set("page", String(query.page));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.chain_id) params.set("chain_id", query.chain_id);
  if (query.session_id) params.set("session_id", query.session_id);

  const qs = params.toString();
  return apiFetch<PaginatedAgentTransactionsResponse>(
    `/api/v1/agent/transactions${qs ? `?${qs}` : ""}`,
  );
}

export async function getAgentTransaction(id: string): Promise<AgentTransactionDetail> {
  return apiFetch<AgentTransactionDetail>(`/api/v1/agent/transactions/${id}`);
}

export async function listSessionAgentTransactions(
  sessionId: string,
): Promise<{ items: AgentTransactionListItem[] }> {
  return apiFetch<{ items: AgentTransactionListItem[] }>(
    `/api/v1/chat/sessions/${sessionId}/transactions`,
  );
}

export function formatTransactionStatus(
  status: AgentTransactionStatus,
  errorCode?: string | null,
): string {
  switch (status) {
    case "pending_approval":
      return "Awaiting approval";
    case "rejected":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "submitted":
      return "Submitted";
    case "success":
      return "Success";
    case "failure":
      return errorCode === "REPAY_NOT_FEASIBLE" ? "Blocked" : "Failed";
    default:
      return status;
  }
}

export function transactionStatusChipClass(status: AgentTransactionStatus): string {
  switch (status) {
    case "success":
      return "border-[var(--hero-mint)] bg-[var(--hero-mint)]/15 text-[var(--hero-mint)]";
    case "failure":
      return "border-[var(--hero-coral)] bg-[var(--hero-coral)]/15 text-[var(--hero-coral)]";
    case "pending_approval":
      return "border-[var(--hero-amber)] bg-[var(--hero-amber)]/15 text-[var(--hero-amber)]";
    case "submitted":
      return "border-[var(--hero-blue)] bg-[var(--hero-blue)]/15 text-[var(--hero-blue)]";
    default:
      return "border-[var(--hero-ink)]/25 bg-[var(--hero-ink)]/5 text-[var(--hero-ink)]/55";
  }
}
