import { enqueueNotificationEmit } from "../../infrastructure/inngest/enqueue-notification-emit.js";
import { logger } from "../../shared/logger.js";
import { logNotificationEvaluatorRun } from "./notification-observability.service.js";
import { ensureNotificationEvaluatorsRegistered } from "./evaluators/index.js";
import { getNotificationEvaluator } from "./evaluators/registry.js";
import type {
  NotificationEmitCandidate,
  PollEvaluatorRunResult,
} from "./notification-evaluator.types.js";
import {
  groupPollRulesByEvaluator,
  loadActivePollRuleContexts,
} from "./notification-poll-rule.loader.js";

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

  if (result.result?.status === "delivered") {
    return { status: "delivered" };
  }

  return { status: "delivered" };
}

export async function runPollEvaluatorCycle(): Promise<PollEvaluatorRunResult[]> {
  ensureNotificationEvaluatorsRegistered();

  const contexts = await loadActivePollRuleContexts();
  const grouped = groupPollRulesByEvaluator(contexts);
  const results: PollEvaluatorRunResult[] = [];

  for (const [evaluatorKey, rules] of grouped.entries()) {
    const startedAt = Date.now();
    const summary: PollEvaluatorRunResult = {
      evaluator_key: evaluatorKey,
      rules_evaluated: rules.length,
      candidates: 0,
      emitted: 0,
      suppressed: 0,
      duplicates: 0,
      errors: 0,
    };

    const evaluator = getNotificationEvaluator(evaluatorKey);
    if (!evaluator) {
      logger.warn("No notification evaluator registered for poll rules", {
        evaluator_key: evaluatorKey,
        rule_count: rules.length,
      });
      results.push(summary);
      continue;
    }

    try {
      const candidates = await evaluator.evaluate(rules);
      summary.candidates = candidates.length;

      for (const candidate of candidates) {
        try {
          const emitResult = await emitCandidate(candidate);
          if (emitResult.status === "duplicate") {
            summary.duplicates += 1;
          } else if (emitResult.status === "suppressed") {
            summary.suppressed += 1;
          } else {
            summary.emitted += 1;
          }
        } catch (error) {
          summary.errors += 1;
          logger.warn("Failed to emit notification candidate", {
            evaluator_key: evaluatorKey,
            rule_id: candidate.rule_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      summary.errors += 1;
      logger.error("Notification evaluator failed", {
        evaluator_key: evaluatorKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    results.push(summary);

    logNotificationEvaluatorRun({
      evaluator_kind: "poll",
      evaluator_key: evaluatorKey,
      duration_ms: Date.now() - startedAt,
      rules_evaluated: summary.rules_evaluated,
      emitted: summary.emitted,
      suppressed: summary.suppressed,
      duplicates: summary.duplicates,
      errors: summary.errors,
    });
  }

  return results;
}
