import { apiFetch } from "@/lib/api";

export type ChatToolCall = {
  name: string;
  result: unknown;
};

export type PendingTransaction = {
  id: string;
  chain_id: string;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  amount_display: string;
};

export type ChatResponse = {
  reply: string;
  session_id: string;
  mode: "stub" | "claude";
  tool_calls: ChatToolCall[];
  pending_transaction: PendingTransaction | null;
};

export type ChatRequest = {
  message: string;
  session_id?: string;
  approve_transaction_id?: string;
};

/** Agent conversation — wallet resolved from session cookie; never send wallet addresses. */
export async function postChat(body: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
