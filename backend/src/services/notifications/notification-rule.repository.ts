import type {
  NotificationRule,
  NotificationRuleSource,
  NotificationRuleStatus,
  NotificationTriggerKind,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { toNotificationJsonValue, toNullableNotificationJsonValue } from "./notification-json.js";

export type CreateNotificationRuleRowInput = {
  userId: bigint;
  projectId?: string | null;
  installationId?: string | null;
  source: NotificationRuleSource;
  sessionId?: string | null;
  label?: string | null;
  notificationType: string;
  triggerKind: NotificationTriggerKind;
  condition: unknown;
  schedule?: unknown;
  channels: unknown;
  cooldownSeconds?: number;
  triggerOnce?: boolean;
  expiresAt?: Date | null;
};

export type UpdateNotificationRuleRowInput = {
  label?: string | null;
  condition?: unknown;
  schedule?: unknown | null;
  channels?: unknown;
  status?: NotificationRuleStatus;
  cooldownSeconds?: number;
  triggerOnce?: boolean;
  expiresAt?: Date | null;
  lastTriggeredAt?: Date | null;
};

export type ListNotificationRulesFilter = {
  userId: bigint;
  projectId?: string;
  installationId?: string;
  status?: NotificationRuleStatus | NotificationRuleStatus[];
  notificationType?: string;
  limit?: number;
  offset?: number;
};

export async function createNotificationRule(
  input: CreateNotificationRuleRowInput,
): Promise<NotificationRule> {
  return prisma.notificationRule.create({
    data: {
      user_id: input.userId,
      project_id: input.projectId ?? null,
      installation_id: input.installationId ?? null,
      source: input.source,
      session_id: input.sessionId ?? null,
      label: input.label ?? null,
      notification_type: input.notificationType,
      trigger_kind: input.triggerKind,
      condition: toNotificationJsonValue(input.condition),
      ...(input.schedule != null ? { schedule: toNotificationJsonValue(input.schedule) } : {}),
      channels: toNotificationJsonValue(input.channels),
      cooldown_seconds: input.cooldownSeconds ?? 300,
      trigger_once: input.triggerOnce ?? false,
      expires_at: input.expiresAt ?? null,
    },
  });
}

export async function findNotificationRuleForUser(
  ruleId: string,
  userId: bigint,
): Promise<NotificationRule | null> {
  return prisma.notificationRule.findFirst({
    where: {
      id: ruleId,
      user_id: userId,
      status: { not: "deleted" },
    },
  });
}

export async function listNotificationRules(
  filter: ListNotificationRulesFilter,
): Promise<{ rules: NotificationRule[]; total: number }> {
  const status: Prisma.EnumNotificationRuleStatusFilter | NotificationRuleStatus =
    filter.status === undefined
      ? { not: "deleted" }
      : Array.isArray(filter.status)
        ? { in: filter.status }
        : filter.status;

  const where: Prisma.NotificationRuleWhereInput = {
    user_id: filter.userId,
    ...(filter.projectId ? { project_id: filter.projectId } : {}),
    ...(filter.installationId ? { installation_id: filter.installationId } : {}),
    ...(filter.notificationType ? { notification_type: filter.notificationType } : {}),
    status,
  };

  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;

  const [rules, total] = await Promise.all([
    prisma.notificationRule.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notificationRule.count({ where }),
  ]);

  return { rules, total };
}

export async function updateNotificationRule(
  ruleId: string,
  userId: bigint,
  input: UpdateNotificationRuleRowInput,
): Promise<NotificationRule | null> {
  const existing = await findNotificationRuleForUser(ruleId, userId);
  if (!existing) {
    return null;
  }

  return prisma.notificationRule.update({
    where: { id: ruleId },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.condition !== undefined ? { condition: toNotificationJsonValue(input.condition) } : {}),
      ...(input.schedule !== undefined
        ? { schedule: toNullableNotificationJsonValue(input.schedule) }
        : {}),
      ...(input.channels !== undefined ? { channels: toNotificationJsonValue(input.channels) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.cooldownSeconds !== undefined ? { cooldown_seconds: input.cooldownSeconds } : {}),
      ...(input.triggerOnce !== undefined ? { trigger_once: input.triggerOnce } : {}),
      ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt } : {}),
      ...(input.lastTriggeredAt !== undefined ? { last_triggered_at: input.lastTriggeredAt } : {}),
    },
  });
}

export async function softDeleteNotificationRule(
  ruleId: string,
  userId: bigint,
): Promise<NotificationRule | null> {
  return updateNotificationRule(ruleId, userId, { status: "deleted" });
}
