import { apiFetch } from "@/lib/api";
import type { ArtifactPayload } from "@/lib/artifact-types";
import type { ChatAppScope } from "@/lib/chat-app-scope";

export type ChatToolCall = {
  name: string;
  query?: string;
  action?: string;
  result: unknown;
};

import type { DeFiApprovalPreview } from "@/lib/defi-approval-preview";
import type { LiquidityFallbackOffer } from "@/lib/cross-chain-fallback";
import type { StellarRoutingFallbackOffer } from "@/lib/stellar-routing-fallback";

export type PendingTransactionApprovalOutcome =
  | "approval_required"
  | "liquidity_fallback_offered"
  | "stellar_routing_fallback_offered";

export type TransactionFiatLeg = {
  role: "pay" | "receive" | "fee";
  amount_display: number;
  symbol: string;
  usd_price: number | null;
  usd_value: number | null;
  price_source: "coingecko" | "stablecoin_peg" | "pool_mid" | "unknown";
};

export type TransactionFiatPreview = {
  legs: TransactionFiatLeg[];
  total_pay_usd: number | null;
  total_receive_usd: number | null;
  net_usd: number | null;
  priced_at: string | null;
};

export type PendingTransaction = {
  id: string;
  chain_id: string;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  amount_display: string;
  quote_expires_at?: string | null;
  fiat_preview?: TransactionFiatPreview | null;
  defi_preview?: DeFiApprovalPreview | null;
  /** Distinguishes normal approval vs alternate-route consent. */
  approval_outcome?: PendingTransactionApprovalOutcome;
  /** Offered when Li-Fi has no liquidity and an alternate route is available. */
  liquidity_fallback_offer?: LiquidityFallbackOffer;
  /** Offered when tokens are Stellar-only but user selected another chain. */
  stellar_routing_fallback_offer?: StellarRoutingFallbackOffer;
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
  artifact: ArtifactPayload | null;
};

export type ChatRequest = {
  message: string;
  session_id?: string;
  app_scope?: ChatAppScope;
  approve_transaction_id?: string;
  reject_transaction_id?: string;
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
  has_active_transaction?: boolean;
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
  app_scope?: unknown;
  created_at: string;
};

export async function fetchChatSessions(): Promise<{
  sessions: ChatSessionListItem[];
}> {
  return apiFetch<{ sessions: ChatSessionListItem[] }>("/api/v1/chat/sessions");
}

export async function fetchSessionMessages(sessionId: string): Promise<{
  session: ChatSessionDetail;
  messages: ApiChatMessage[];
}> {
  return apiFetch<{ session: ChatSessionDetail; messages: ApiChatMessage[] }>(
    `/api/v1/chat/sessions/${sessionId}/messages`,
  );
}

export async function deleteChatSession(sessionId: string): Promise<{ id: string; deleted: true }> {
  return apiFetch<{ id: string; deleted: true }>(`/api/v1/chat/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

/** Agent conversation — wallet resolved from session cookie; never send wallet addresses. */
export async function postChat(body: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
