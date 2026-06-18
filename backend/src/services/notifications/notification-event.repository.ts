import type {
  NotificationChannelType,
  NotificationDelivery,
  NotificationDeliveryStatus,
  NotificationEvent,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { toNotificationJsonValue } from "./notification-json.js";
import type { NotificationEventPayload } from "./notification-schema.types.js";

export type CreateNotificationEventInput = {
  userId: bigint;
  ruleId?: string | null;
  projectId?: string | null;
  installationId?: string | null;
  notificationType: string;
  title: string;
  body: string;
  payload: NotificationEventPayload;
  idempotencyKey?: string | null;
};

export type CreateNotificationDeliveryInput = {
  eventId: string;
  channel: NotificationChannelType;
  status: NotificationDeliveryStatus;
  error?: string | null;
  sentAt?: Date | null;
};

export type ListNotificationEventsFilter = {
  userId: bigint;
  unread?: boolean;
  limit?: number;
  offset?: number;
};

export async function createNotificationEvent(
  input: CreateNotificationEventInput,
): Promise<NotificationEvent> {
  return prisma.notificationEvent.create({
    data: {
      user_id: input.userId,
      rule_id: input.ruleId ?? null,
      project_id: input.projectId ?? null,
      installation_id: input.installationId ?? null,
      notification_type: input.notificationType,
      title: input.title,
      body: input.body,
      payload: toNotificationJsonValue(input.payload),
      idempotency_key: input.idempotencyKey ?? null,
    },
  });
}

export async function findNotificationEventByIdempotencyKey(
  idempotencyKey: string,
): Promise<NotificationEvent | null> {
  return prisma.notificationEvent.findUnique({
    where: { idempotency_key: idempotencyKey },
  });
}

export async function findNotificationEventForUser(
  eventId: string,
  userId: bigint,
): Promise<NotificationEvent | null> {
  return prisma.notificationEvent.findFirst({
    where: { id: eventId, user_id: userId },
  });
}

export async function listNotificationEvents(
  filter: ListNotificationEventsFilter,
): Promise<{ events: NotificationEvent[]; total: number }> {
  const where: Prisma.NotificationEventWhereInput = {
    user_id: filter.userId,
    ...(filter.unread
      ? {
          deliveries: {
            some: {
              channel: "in_app",
              status: "sent",
              read_at: null,
            },
          },
        }
      : {}),
  };

  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;

  const [events, total] = await Promise.all([
    prisma.notificationEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
      include: {
        deliveries: true,
      },
    }),
    prisma.notificationEvent.count({ where }),
  ]);

  return { events, total };
}

export async function countNotificationEventsSince(
  userId: bigint,
  since: Date,
): Promise<number> {
  return prisma.notificationEvent.count({
    where: {
      user_id: userId,
      created_at: { gte: since },
    },
  });
}

export async function createNotificationDeliveries(
  deliveries: CreateNotificationDeliveryInput[],
): Promise<NotificationDelivery[]> {
  if (deliveries.length === 0) {
    return [];
  }

  await prisma.notificationDelivery.createMany({
    data: deliveries.map((delivery) => ({
      event_id: delivery.eventId,
      channel: delivery.channel,
      status: delivery.status,
      error: delivery.error ?? null,
      sent_at: delivery.sentAt ?? null,
    })),
  });

  return prisma.notificationDelivery.findMany({
    where: { event_id: deliveries[0]!.eventId },
  });
}

export async function markInAppDeliveryRead(
  eventId: string,
  userId: bigint,
): Promise<NotificationDelivery | null> {
  const event = await findNotificationEventForUser(eventId, userId);
  if (!event) {
    return null;
  }

  const delivery = await prisma.notificationDelivery.findFirst({
    where: {
      event_id: eventId,
      channel: "in_app",
      status: "sent",
    },
  });

  if (!delivery) {
    return null;
  }

  return prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "read",
      read_at: new Date(),
    },
  });
}

export async function countUnreadNotificationEvents(userId: bigint): Promise<number> {
  return prisma.notificationEvent.count({
    where: {
      user_id: userId,
      deliveries: {
        some: {
          channel: "in_app",
          status: "sent",
          read_at: null,
        },
      },
    },
  });
}
