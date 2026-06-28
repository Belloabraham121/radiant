import type { NotificationRule } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { resolveNotificationTypeDefinition } from "./notification-schema.service.js";
import type { PollRuleEvaluationContext } from "./notification-evaluator.types.js";

export async function loadActivePollRuleContexts(): Promise<PollRuleEvaluationContext[]> {
  const now = new Date();

  const rules = await prisma.notificationRule.findMany({
    where: {
      status: "active",
      trigger_kind: "poll",
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    include: {
      user: {
        select: {
          id: true,
          privy_user_id: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });

  const contexts: PollRuleEvaluationContext[] = [];

  for (const rule of rules) {
    const context = buildPollRuleContext(rule);
    if (context) {
      contexts.push(context);
    }
  }

  return contexts;
}

function buildPollRuleContext(
  rule: NotificationRule & { user: { id: bigint; privy_user_id: string } },
): PollRuleEvaluationContext | null {
  const typeDefinition = resolveNotificationTypeDefinition({
    notification_type: rule.notification_type,
  });

  if (!typeDefinition || typeDefinition.trigger_kind !== "poll") {
    return null;
  }

  if (!typeDefinition.evaluator) {
    return null;
  }

  return {
    rule,
    typeDefinition,
    privyUserId: rule.user.privy_user_id,
  };
}

export function groupPollRulesByEvaluator(
  contexts: PollRuleEvaluationContext[],
): Map<string, PollRuleEvaluationContext[]> {
  const grouped = new Map<string, PollRuleEvaluationContext[]>();

  for (const context of contexts) {
    const key = context.typeDefinition.evaluator!;
    const bucket = grouped.get(key) ?? [];
    bucket.push(context);
    grouped.set(key, bucket);
  }

  return grouped;
}
