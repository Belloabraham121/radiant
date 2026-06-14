"use client";

import { useEffect, useRef } from "react";
import {
  AGENT_STREAM_SSE_EVENT_TYPES,
  agentStreamUrl,
  mapSseAgentEventToPreviewPayload,
} from "@/lib/agent-stream";
import type { RadiantAgentStreamEvent } from "@/lib/artifact-preview-bridge";

export type AgentStreamPreviewPayload = Omit<RadiantAgentStreamEvent, "type">;

/**
 * Subscribe to live agent SSE for a chat session (Phase 8).
 * Requires an authenticated cookie — same-origin `/api/v1/...` proxy.
 */
export function useAgentStream(
  sessionId: string | undefined,
  onEvent: (event: AgentStreamPreviewPayload) => void,
  enabled = true,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !sessionId) {
      return;
    }

    const source = new EventSource(agentStreamUrl(sessionId), { withCredentials: true });

    function handleSseEvent(event: Event) {
      const message = event as MessageEvent<string>;
      if (typeof message.data !== "string") {
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(message.data) as Record<string, unknown>;
      } catch {
        return;
      }

      const payload = mapSseAgentEventToPreviewPayload(event.type, data);
      if (payload) {
        onEventRef.current(payload);
      }
    }

    for (const eventType of AGENT_STREAM_SSE_EVENT_TYPES) {
      source.addEventListener(eventType, handleSseEvent);
    }

    return () => {
      for (const eventType of AGENT_STREAM_SSE_EVENT_TYPES) {
        source.removeEventListener(eventType, handleSseEvent);
      }
      source.close();
    };
  }, [enabled, sessionId]);
}
