"use client";

import { useEffect, useRef } from "react";
import {
  NOTIFICATION_STREAM_SSE_EVENT_TYPES,
  notificationStreamUrl,
  parseNotificationStreamPayload,
  type NotificationStreamPayload,
} from "@/lib/notification-stream";

/**
 * Subscribe to live notification SSE for the signed-in user (Phase 8).
 * Requires an authenticated cookie — same-origin `/api/v1/notifications/stream`.
 */
export function useNotificationStream(
  onEvent: (event: NotificationStreamPayload) => void,
  enabled = true,
): void {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const source = new EventSource(notificationStreamUrl(), { withCredentials: true });

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

      const payload = parseNotificationStreamPayload(event.type, data);
      if (payload) {
        onEventRef.current(payload);
      }
    }

    for (const eventType of NOTIFICATION_STREAM_SSE_EVENT_TYPES) {
      source.addEventListener(eventType, handleSseEvent);
    }

    return () => {
      for (const eventType of NOTIFICATION_STREAM_SSE_EVENT_TYPES) {
        source.removeEventListener(eventType, handleSseEvent);
      }
      source.close();
    };
  }, [enabled]);
}
