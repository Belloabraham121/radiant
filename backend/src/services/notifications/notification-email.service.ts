import type { NotificationEvent } from "@prisma/client";
import { createLogger } from "../../shared/logger.js";
import type { NotificationEventPayload } from "./notification-schema.types.js";

const log = createLogger("notification-email");

export type EmailDeliveryResult =
  | { status: "skipped"; reason: string }
  | { status: "sent"; message_id: string };

/**
 * Email channel placeholder — schema and rules may include `email`, but delivery is not wired yet.
 */
export async function deliverEmailNotification(input: {
  userId: bigint;
  event: NotificationEvent;
  payload: NotificationEventPayload;
}): Promise<EmailDeliveryResult> {
  log.info("Email notification delivery skipped (not implemented)", {
    user_id: input.userId.toString(),
    event_id: input.event.id,
    notification_type: input.event.notification_type,
    title: input.event.title,
  });

  return {
    status: "skipped",
    reason: "email_channel_not_implemented",
  };
}
