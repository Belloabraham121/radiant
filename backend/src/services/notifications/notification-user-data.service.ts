import type {
  NotificationEvent,
  NotificationPreference,
  NotificationPushSubscription,
  NotificationRule,
} from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

const EXPORT_EVENT_LIMIT = 5_000;
const EXPORT_RULE_LIMIT = 2_000;

export type NotificationUserDataExport = {
  preferences: NotificationPreference | null;
  rules: Array<{
    id: string;
    notification_type: string;
    label: string | null;
    status: string;
    trigger_kind: string;
    source: string;
    project_id: string | null;
    installation_id: string | null;
    condition: unknown;
    schedule: unknown;
    channels: unknown;
    created_at: string;
    updated_at: string;
    last_triggered_at: string | null;
  }>;
  events: Array<{
    id: string;
    notification_type: string;
    title: string;
    body: string;
    payload: unknown;
    project_id: string | null;
    installation_id: string | null;
    rule_id: string | null;
    created_at: string;
    deliveries: Array<{
      channel: string;
      status: string;
      error: string | null;
      sent_at: string | null;
      read_at: string | null;
    }>;
  }>;
  push_subscriptions: Array<{
    id: string;
    endpoint: string;
    user_agent: string | null;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>;
};

function serializeRule(rule: NotificationRule): NotificationUserDataExport["rules"][number] {
  return {
    id: rule.id,
    notification_type: rule.notification_type,
    label: rule.label,
    status: rule.status,
    trigger_kind: rule.trigger_kind,
    source: rule.source,
    project_id: rule.project_id,
    installation_id: rule.installation_id,
    condition: rule.condition,
    schedule: rule.schedule,
    channels: rule.channels,
    created_at: rule.created_at.toISOString(),
    updated_at: rule.updated_at.toISOString(),
    last_triggered_at: rule.last_triggered_at?.toISOString() ?? null,
  };
}

function serializeEvent(
  event: NotificationEvent & {
    deliveries: Array<{
      channel: string;
      status: string;
      error: string | null;
      sent_at: Date | null;
      read_at: Date | null;
    }>;
  },
): NotificationUserDataExport["events"][number] {
  return {
    id: event.id,
    notification_type: event.notification_type,
    title: event.title,
    body: event.body,
    payload: event.payload,
    project_id: event.project_id,
    installation_id: event.installation_id,
    rule_id: event.rule_id,
    created_at: event.created_at.toISOString(),
    deliveries: event.deliveries.map((delivery) => ({
      channel: delivery.channel,
      status: delivery.status,
      error: delivery.error,
      sent_at: delivery.sent_at?.toISOString() ?? null,
      read_at: delivery.read_at?.toISOString() ?? null,
    })),
  };
}

function serializePushSubscription(
  row: NotificationPushSubscription,
): NotificationUserDataExport["push_subscriptions"][number] {
  return {
    id: row.id,
    endpoint: row.endpoint,
    user_agent: row.user_agent,
    created_at: row.created_at.toISOString(),
    last_used_at: row.last_used_at?.toISOString() ?? null,
    revoked_at: row.revoked_at?.toISOString() ?? null,
  };
}

export async function exportNotificationDataForUser(
  userId: bigint,
): Promise<NotificationUserDataExport> {
  const [preferences, rules, events, pushSubscriptions] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { user_id: userId } }),
    prisma.notificationRule.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: EXPORT_RULE_LIMIT,
    }),
    prisma.notificationEvent.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: EXPORT_EVENT_LIMIT,
      include: {
        deliveries: {
          select: {
            channel: true,
            status: true,
            error: true,
            sent_at: true,
            read_at: true,
          },
        },
      },
    }),
    prisma.notificationPushSubscription.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    }),
  ]);

  return {
    preferences,
    rules: rules.map(serializeRule),
    events: events.map(serializeEvent),
    push_subscriptions: pushSubscriptions.map(serializePushSubscription),
  };
}

/** Explicit cleanup before account deletion (User row CASCADE also removes these). */
export async function deleteNotificationDataForUser(userId: bigint): Promise<void> {
  await prisma.$transaction([
    prisma.notificationDelivery.deleteMany({
      where: { event: { user_id: userId } },
    }),
    prisma.notificationEvent.deleteMany({ where: { user_id: userId } }),
    prisma.notificationRule.deleteMany({ where: { user_id: userId } }),
    prisma.notificationPushSubscription.deleteMany({ where: { user_id: userId } }),
    prisma.notificationPreference.deleteMany({ where: { user_id: userId } }),
  ]);
}
