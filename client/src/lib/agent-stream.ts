import type { RadiantAgentStreamEvent } from "./artifact-preview-bridge";

export const AGENT_STREAM_SSE_EVENT_TYPES = [
  "agent_thinking",
  "agent_action",
  "agent_step",
  "agent_done",
  "agent_error",
] as const;

export type AgentStreamSseEventType = (typeof AGENT_STREAM_SSE_EVENT_TYPES)[number];

/** Map backend SSE payload → preview iframe postMessage body (without `type`). */
export function mapSseAgentEventToPreviewPayload(
  eventType: string,
  data: Record<string, unknown>,
): Omit<RadiantAgentStreamEvent, "type"> | null {
  switch (eventType) {
    case "agent_thinking":
      if (data.active === true) {
        return { active: true };
      }
      if (data.active === false) {
        return { active: false };
      }
      return null;
    case "agent_action":
      return {
        action: typeof data.action === "string" ? data.action : undefined,
        params:
          data.params && typeof data.params === "object"
            ? (data.params as Record<string, unknown>)
            : undefined,
        animate: data.animate === true || data.step === "execute_in_app",
        step: typeof data.step === "string" ? data.step : data.animate === true ? "executing" : undefined,
        pending:
          data.pending && typeof data.pending === "object"
            ? (data.pending as Record<string, unknown>)
            : undefined,
      };
    case "agent_step":
      return {
        action: typeof data.action === "string" ? data.action : undefined,
        target: typeof data.target === "string" ? data.target : undefined,
        value: data.value,
      };
    case "agent_done":
      return {
        action: typeof data.action === "string" ? data.action : undefined,
        digest: typeof data.digest === "string" ? data.digest : undefined,
        refresh: data.refresh === true,
        step: "result",
      };
    case "agent_error":
      return {
        action: typeof data.action === "string" ? data.action : undefined,
        code: typeof data.code === "string" ? data.code : undefined,
        message: typeof data.message === "string" ? data.message : undefined,
        active: false,
      };
    default:
      return null;
  }
}

export function agentStreamUrl(sessionId: string): string {
  return `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/agent-stream`;
}

/** Preview animation may lead/lag the tx by ~300ms; trust `agent_done.digest` from the backend. */
export const AGENT_STREAM_ORDERING_NOTE =
  "Animation is best-effort; agent_done.digest and the chat ledger are source of truth.";
