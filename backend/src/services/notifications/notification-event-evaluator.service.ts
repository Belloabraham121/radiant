import { enqueueNotificationEmit } from "../../infrastructure/inngest/enqueue-notification-emit.js";
import { logger } from "../../shared/logger.js";
import { matchesNotificationEventCondition } from "./notification-event-matcher.service.js";
import { loadEventRuleEvaluationContexts } from "./notification-event-rule.loader.js";
import type {
  ProcessNotificationEventInput,
  ProcessNotificationEventResult,
} from "./notification-event.types.js";
import { renderNotificationPresentation } from "./notification-presentation.service.js";

function buildEventIdempotencyKey(base: string | undefined, ruleId: string, notificationType: string): string {
  if (base) {
    return `${base}:rule:${ruleId}`;
  }
  return `event:${notificationType}:rule:${ruleId}`;
}

export async function processNotificationEvent(
  input: ProcessNotificationEventInput,
): Promise<ProcessNotificationEventResult> {
  const notificationType = input.notificationType.trim();
  const eventData = input.data ?? {};

  const contexts = await loadEventRuleEvaluationContexts({
    notificationType,
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  });

  const summary: ProcessNotificationEventResult = {
    notification_type: notificationType,
    rules_evaluated: contexts.length,
    rules_matched: 0,
    emitted: 0,
    suppressed: 0,
    duplicates: 0,
    errors: 0,
  };

  for (const context of contexts) {
    const ruleCondition = context.rule.condition as Record<string, unknown>;
    if (!matchesNotificationEventCondition(ruleCondition, eventData)) {
      continue;
    }

    summary.rules_matched += 1;

    const label = context.rule.label ?? context.typeDefinition.label;
    const message =
      typeof eventData.message === "string"
        ? eventData.message
        : typeof ruleCondition.message === "string"
          ? ruleCondition.message
          : null;

    const presentation = renderNotificationPresentation(
      context.typeDefinition.presentation,
      {
        label,
        message: message ?? "",
        ...eventData,
        ...ruleCondition,
      },
      {
        title: input.title ?? label,
        body: input.body ?? message ?? context.typeDefinition.description,
      },
    );

    try {
      const result = await enqueueNotificationEmit({
        userId: context.rule.user_id,
        ruleId: context.rule.id,
        notificationType: context.rule.notification_type,
        title: presentation.title,
        body: presentation.body,
        payload: {
          ...(presentation.deep_link ? { deep_link: presentation.deep_link } : {}),
          data: eventData,
          rule_id: context.rule.id,
          severity: "info",
        },
        idempotencyKey: buildEventIdempotencyKey(
          input.idempotencyKey,
          context.rule.id,
          notificationType,
        ),
      });

      if (result.result?.status === "duplicate") {
        summary.duplicates += 1;
      } else if (result.result?.status === "suppressed") {
        summary.suppressed += 1;
      } else {
        summary.emitted += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.warn("Failed to emit matched event notification", {
        rule_id: context.rule.id,
        notification_type: notificationType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
