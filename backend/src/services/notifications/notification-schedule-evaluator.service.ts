import { enqueueNotificationEmit } from "../../infrastructure/inngest/enqueue-notification-emit.js";
import { logger } from "../../shared/logger.js";
import type { NotificationEmitCandidate } from "./notification-evaluator.types.js";
import { renderNotificationPresentation } from "./notification-presentation.service.js";
import type { NotificationSchedule } from "./notification-schema.types.js";
import { loadActiveScheduleRuleContexts } from "./notification-schedule-rule.loader.js";
import {
  buildScheduleIdempotencyKey,
  isScheduleDue,
} from "./notification-schedule.service.js";
import type { ScheduleEvaluatorRunResult, ScheduleRuleEvaluationContext } from "./notification-schedule.types.js";
import { findNotificationRuleById } from "./notification-rule.repository.js";

function buildScheduleCandidate(
  context: ScheduleRuleEvaluationContext,
  now: Date,
): NotificationEmitCandidate {
  const { rule, typeDefinition, projectId, installationId } = context;
  const schedule = rule.schedule as NotificationSchedule;
  const condition = rule.condition as Record<string, unknown>;
  const message =
    typeof condition.message === "string"
      ? condition.message
      : typeof condition.text === "string"
        ? condition.text
        : null;

  const fallbackTitle = rule.label ?? typeDefinition.label;
  const fallbackBody = message ?? typeDefinition.description;

  const presentation = renderNotificationPresentation(
    typeDefinition.presentation,
    {
      label: rule.label ?? typeDefinition.label,
      message: message ?? "",
      project_id: projectId ?? "",
      ...(condition as Record<string, string | number | undefined | null>),
    },
    { title: fallbackTitle, body: fallbackBody },
  );

  const deepLink =
    presentation.deep_link ??
    (projectId ? `/app/projects/${projectId}/run` : undefined);

  return {
    rule_id: rule.id,
    user_id: rule.user_id,
    notification_type: rule.notification_type,
    title: presentation.title,
    body: presentation.body,
    payload: {
      ...(deepLink ? { deep_link: deepLink } : {}),
      data: condition,
      rule_id: rule.id,
      severity: "info",
    },
    idempotency_key: buildScheduleIdempotencyKey(rule.id, schedule, now),
    project_id: projectId,
    installation_id: installationId,
  };
}

async function emitCandidate(candidate: NotificationEmitCandidate): Promise<{
  status: "delivered" | "duplicate" | "suppressed";
}> {
  const result = await enqueueNotificationEmit({
    userId: candidate.user_id,
    ruleId: candidate.rule_id,
    notificationType: candidate.notification_type,
    title: candidate.title,
    body: candidate.body,
    payload: candidate.payload,
    idempotencyKey: candidate.idempotency_key,
    projectId: candidate.project_id ?? undefined,
    installationId: candidate.installation_id ?? undefined,
  });

  if (result.result?.status === "duplicate") {
    return { status: "duplicate" };
  }
  if (result.result?.status === "suppressed") {
    return { status: "suppressed" };
  }
  return { status: "delivered" };
}

export async function fireScheduleRuleById(ruleId: string): Promise<ScheduleEvaluatorRunResult> {
  const summary: ScheduleEvaluatorRunResult = {
    rules_evaluated: 0,
    candidates: 0,
    emitted: 0,
    suppressed: 0,
    duplicates: 0,
    errors: 0,
    skipped_not_due: 0,
  };

  const rule = await findNotificationRuleById(ruleId);
  if (!rule || rule.status !== "active" || rule.trigger_kind !== "schedule" || !rule.schedule) {
    return summary;
  }

  const contexts = await loadActiveScheduleRuleContexts();
  const context = contexts.find((entry) => entry.rule.id === ruleId);
  if (!context) {
    return summary;
  }

  summary.rules_evaluated = 1;
  const now = new Date();
  const schedule = rule.schedule as NotificationSchedule;

  if (!isScheduleDue(schedule, {
    now,
    lastTriggeredAt: rule.last_triggered_at,
    createdAt: rule.created_at,
  })) {
    summary.skipped_not_due = 1;
    return summary;
  }

  summary.candidates = 1;
  try {
    const emitResult = await emitCandidate(buildScheduleCandidate(context, now));
    if (emitResult.status === "duplicate") {
      summary.duplicates = 1;
    } else if (emitResult.status === "suppressed") {
      summary.suppressed = 1;
    } else {
      summary.emitted = 1;
    }
  } catch (error) {
    summary.errors = 1;
    logger.warn("Failed to fire scheduled notification rule", {
      rule_id: ruleId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return summary;
}

export async function runScheduleEvaluatorCycle(): Promise<ScheduleEvaluatorRunResult> {
  const contexts = await loadActiveScheduleRuleContexts();
  const summary: ScheduleEvaluatorRunResult = {
    rules_evaluated: contexts.length,
    candidates: 0,
    emitted: 0,
    suppressed: 0,
    duplicates: 0,
    errors: 0,
    skipped_not_due: 0,
  };

  const now = new Date();

  for (const context of contexts) {
    const schedule = context.rule.schedule as NotificationSchedule | null;
    if (!schedule) {
      continue;
    }

    if (
      !isScheduleDue(schedule, {
        now,
        lastTriggeredAt: context.rule.last_triggered_at,
        createdAt: context.rule.created_at,
      })
    ) {
      summary.skipped_not_due += 1;
      continue;
    }

    summary.candidates += 1;

    try {
      const emitResult = await emitCandidate(buildScheduleCandidate(context, now));
      if (emitResult.status === "duplicate") {
        summary.duplicates += 1;
      } else if (emitResult.status === "suppressed") {
        summary.suppressed += 1;
      } else {
        summary.emitted += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.warn("Failed to emit scheduled notification", {
        rule_id: context.rule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
