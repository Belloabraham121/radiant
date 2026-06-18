import type { NotificationEventPayload } from "./notification-schema.types.js";

export type NotificationStreamEvent = {
  type: "notification";
  event_id: string;
  notification_type: string;
  title: string;
  body: string;
  payload: NotificationEventPayload;
  project_id: string | null;
  installation_id: string | null;
  rule_id: string | null;
  ts: string;
};
