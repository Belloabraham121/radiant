import type { NotificationEventPayload } from "./notification-schema.types.js";

export type NotificationStreamEvent = {
  type: "notification";
  event_id: string;
  notification_type: string;
  title: string;
  body: string;
  payload: NotificationEventPayload;
  rule_id: string | null;
  ts: string;
};
