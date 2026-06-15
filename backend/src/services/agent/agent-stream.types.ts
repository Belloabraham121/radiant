/** Live agent preview events — SSE `event:` name + JSON payload (Phase 8). */

export const AGENT_STREAM_EVENT_TYPES = [
  "agent_thinking",
  "agent_action",
  "agent_step",
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
