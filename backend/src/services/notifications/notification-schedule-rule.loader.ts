import type { NotificationRule } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { getOrCreateNotificationPreference } from "./notification-preference.repository.js";
import { resolveNotificationTypeDefinition } from "./notification-schema.service.js";
import type { ScheduleRuleEvaluationContext } from "./notification-schedule.types.js";

export async function loadActiveScheduleRuleContexts(): Promise<ScheduleRuleEvaluationContext[]> {
  const now = new Date();

  const rules = await prisma.notificationRule.findMany({
    where: {
      status: "active",
      trigger_kind: "schedule",
      schedule: { not: Prisma.DbNull },
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    orderBy: { created_at: "asc" },
  });

  if (rules.length === 0) {
    return [];
  }

  const userIds = new Set(rules.map((rule) => rule.user_id));
  const preferences = await Promise.all(
    [...userIds].map((userId) => getOrCreateNotificationPreference(userId)),
  );
  const timezoneByUserId = new Map(preferences.map((pref) => [pref.user_id, pref.timezone]));

  const contexts: ScheduleRuleEvaluationContext[] = [];

  for (const rule of rules) {
    const context = buildScheduleRuleContext(
      rule,
      timezoneByUserId.get(rule.user_id) ?? "UTC",
    );
    if (context) {
      contexts.push(context);
    }
  }

  return contexts;
}

function buildScheduleRuleContext(
  rule: NotificationRule,
  preferenceTimezone: string,
): ScheduleRuleEvaluationContext | null {
  const typeDefinition = resolveNotificationTypeDefinition({
    notification_type: rule.notification_type,
  });

  if (!typeDefinition || typeDefinition.trigger_kind !== "schedule") {
    return null;
  }

  return {
    rule,
    typeDefinition,
    timezone: preferenceTimezone,
  };
}
