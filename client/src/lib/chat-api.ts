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

export type PendingClarification = {
  id: string;
  question: string;
  step_index?: number;
  kind: "intent" | "amount_ref" | "constraint_skip";
  plan_preview?: string;
};

export type ChatResponse = {
  reply: string;
  session_id: string;
  mode: "openai" | "stub";
  tool_calls: ChatToolCall[];
  pending_transaction: PendingTransaction | null;
  pending_clarification: PendingClarification | null;
  message_id: string;
};

export type ChatRequest = {
  message: string;
  session_id?: string;
  approve_transaction_id?: string;
  clarification_id?: string;
  clarification_response?: "yes" | "no";
};

export type ChatSessionListItem = {
  id: string;
  title: string;
  updated_at: string;
  preview: string | null;
};

export type ChatSessionDetail = {
  id: string;
  title: string;
  updated_at: string;
  created_at?: string;
};

export type ApiChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: unknown;
  created_at: string;
};

export async function fetchChatSessions(): Promise<{ sessions: ChatSessionListItem[] }> {
  return apiFetch<{ sessions: ChatSessionListItem[] }>("/api/v1/chat/sessions");
}

export async function createChatSession(
  title?: string,
): Promise<ChatSessionDetail & { created_at: string }> {
  return apiFetch<ChatSessionDetail & { created_at: string }>("/api/v1/chat/sessions", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function fetchSessionMessages(sessionId: string): Promise<{
  session: ChatSessionDetail;
  messages: ApiChatMessage[];
}> {
  return apiFetch<{ session: ChatSessionDetail; messages: ApiChatMessage[] }>(
    `/api/v1/chat/sessions/${sessionId}/messages`,
  );
}

/** Agent conversation — wallet resolved from session cookie; never send wallet addresses. */
export async function postChat(body: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
