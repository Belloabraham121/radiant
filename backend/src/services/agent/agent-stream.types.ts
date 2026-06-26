/** Live agent preview events — SSE `event:` name + JSON payload (Phase 8). */

export const AGENT_STREAM_EVENT_TYPES = [
  "agent_thinking",
  "agent_action",
  "agent_step",
  "execution_step",
  "agent_done",
  "agent_error",
] as const;

export type AgentStreamEventType = (typeof AGENT_STREAM_EVENT_TYPES)[number];

export type AgentStreamEventPayload = {
  session_id: string;
  ts: string;
  action?: string;
  params?: Record<string, unknown>;
  animate?: boolean;
  target?: string;
  value?: unknown;
  step?: string;
  execution_step?: Record<string, unknown>;
  digest?: string;
  refresh?: boolean;
  message?: string;
  code?: string;
  active?: boolean;
  pending?: Record<string, unknown>;
};

export type AgentStreamEvent = AgentStreamEventPayload & {
  type: AgentStreamEventType;
};

export type AgentStreamEventInput = Omit<AgentStreamEventPayload, "session_id" | "ts">;

/** Cross-chain liquidity fallback execution timeline step ids (SSE `execution_step.id`). */
export const CROSS_CHAIN_STREAM_STEP_IDS = [
  "liquidity_fallback_offered",
  "squid_quote",
  "finding_alternate_route",
] as const;

export type CrossChainStreamStepId = (typeof CROSS_CHAIN_STREAM_STEP_IDS)[number];

export type LiquidityFallbackOfferedStreamInput = {
  fallback_offer_id: string;
  from_token: string;
  to_token: string;
  from_chain_id?: string;
  to_chain_id?: string;
};

export type SquidQuoteStreamInput = {
  status: "running" | "ok" | "failed";
  from_token?: string;
  to_token?: string;
  detail?: string;
  fallback_offer_id?: string;
};
