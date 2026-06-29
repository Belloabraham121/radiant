import type { NotificationDelivery, NotificationEvent } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import {
  findNotificationEventForUser,
  listNotificationEvents,
  markInAppDeliveryRead,
} from "./notification-event.repository.js";
import type { NotificationEventPayload } from "./notification-schema.types.js";

export type NotificationEventRecord = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  payload: NotificationEventPayload;
  rule_id: string | null;
  created_at: string;
  unread: boolean;
  deliveries: Array<{
    channel: string;
    status: string;
    sent_at: string | null;
    read_at: string | null;
  }>;
};

function toEventRecord(
  event: NotificationEvent & { deliveries: NotificationDelivery[] },
): NotificationEventRecord {
  const inAppDelivery = event.deliveries.find((delivery) => delivery.channel === "in_app");
  const unread =
    inAppDelivery?.status === "sent" && inAppDelivery.read_at == null;

  return {
    id: event.id,
    notification_type: event.notification_type,
    title: event.title,
    body: event.body,
    payload: event.payload as NotificationEventPayload,
    rule_id: event.rule_id,
    created_at: event.created_at.toISOString(),
    unread,
    deliveries: event.deliveries.map((delivery) => ({
      channel: delivery.channel,
      status: delivery.status,
      sent_at: delivery.sent_at?.toISOString() ?? null,
      read_at: delivery.read_at?.toISOString() ?? null,
    })),
  };
}

export async function listNotificationEventsForUser(
  privyUserId: string,
  query: { unread?: boolean; limit?: number; offset?: number },
): Promise<{ events: NotificationEventRecord[]; total: number }> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const { events, total } = await listNotificationEvents({
    userId: user.id,
    unread: query.unread,
    limit: query.limit,
    offset: query.offset,
  });

  return {
    events: events.map((event) => toEventRecord(event)),
    total,
  };
}

export async function markNotificationEventReadForUser(
  privyUserId: string,
  eventId: string,
): Promise<{ event_id: string; read_at: string }> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const event = await findNotificationEventForUser(eventId, user.id);
  if (!event) {
    throw new AppError(404, "EVENT_NOT_FOUND", "Notification event not found");
  }

  const delivery = await markInAppDeliveryRead(eventId, user.id);
  if (!delivery?.read_at) {
    throw new AppError(404, "DELIVERY_NOT_FOUND", "In-app delivery not found or already read");
  }

  return {
    event_id: eventId,
    read_at: delivery.read_at.toISOString(),
  };
}

export async function requireNotificationStreamUser(
  privyUserId: string,
): Promise<bigint> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}
