export type NotificationStreamPayload = {
  type: "notification";
  event_id: string;
  notification_type: string;
  title: string;
  body: string;
  payload: {
    deep_link?: string;
    data?: Record<string, unknown>;
    rule_id?: string;
    severity?: "info" | "warning" | "critical";
  };
  rule_id: string | null;
  ts: string;
};

export const NOTIFICATION_STREAM_SSE_EVENT_TYPES = ["notification", "connected"] as const;

export function notificationStreamUrl(): string {
  return "/api/v1/notifications/stream";
}

export function parseNotificationStreamPayload(
  eventType: string,
  data: Record<string, unknown>,
): NotificationStreamPayload | null {
  if (eventType !== "notification") {
    return null;
  }

  if (typeof data.event_id !== "string" || typeof data.title !== "string") {
    return null;
  }

  const payload =
    data.payload && typeof data.payload === "object"
      ? (data.payload as NotificationStreamPayload["payload"])
      : {};

  return {
    type: "notification",
    event_id: data.event_id,
    notification_type: typeof data.notification_type === "string" ? data.notification_type : "",
    title: data.title,
    body: typeof data.body === "string" ? data.body : "",
    payload,
    rule_id: typeof data.rule_id === "string" ? data.rule_id : null,
    ts: typeof data.ts === "string" ? data.ts : new Date().toISOString(),
  };
}
