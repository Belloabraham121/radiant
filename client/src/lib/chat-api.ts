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

export type ClarificationInteractionType =
  | "confirm"
  | "input"
  | "single_choice"
  | "multi_choice";

export type ClarificationOption = {
  id: string;
  label: string;
};

export type ClarificationSuggestion = {
  label: string;
  value: string | number;
};

export type ClarificationAnswer = {
  confirm?: "yes" | "no";
  value?: string | number;
  selected_option_id?: string;
  selected_option_ids?: string[];
};

export type PendingClarification = {
  id: string;
  gap_id: string;
  interaction_type: ClarificationInteractionType;
  question: string;
  step_index: number;
  field?: string;
  kind: "intent" | "amount_ref" | "constraint_skip";
  input_kind?: "number" | "text";
  placeholder?: string;
  hint?: string;
  options?: ClarificationOption[];
  suggestions?: ClarificationSuggestion[];
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
  /** @deprecated use clarification_confirm */
  clarification_response?: "yes" | "no";
  clarification_confirm?: "yes" | "no";
  clarification_value?: string | number;
  clarification_option_id?: string;
  clarification_option_ids?: string[];
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
