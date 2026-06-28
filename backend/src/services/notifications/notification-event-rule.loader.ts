import type { NotificationRule } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { resolveNotificationTypeDefinition } from "./notification-schema.service.js";
import type { EventRuleEvaluationContext } from "./notification-event.types.js";

export type ListActiveEventRulesInput = {
  notificationType: string;
  userId?: bigint;
};

export async function listActiveEventRules(
  input: ListActiveEventRulesInput,
): Promise<NotificationRule[]> {
  const now = new Date();

  return prisma.notificationRule.findMany({
    where: {
      status: "active",
      trigger_kind: "event",
      notification_type: input.notificationType,
      ...(input.userId !== undefined ? { user_id: input.userId } : {}),
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    orderBy: { created_at: "asc" },
  });
}

export async function loadEventRuleEvaluationContexts(
  input: ListActiveEventRulesInput,
): Promise<EventRuleEvaluationContext[]> {
  const rules = await listActiveEventRules(input);
  const contexts: EventRuleEvaluationContext[] = [];

  for (const rule of rules) {
    const typeDefinition = resolveNotificationTypeDefinition({
      notification_type: rule.notification_type,
    });

    if (!typeDefinition || typeDefinition.trigger_kind !== "event") {
      continue;
    }

    contexts.push({
      rule,
      typeDefinition,
    });
  }

  return contexts;
}
