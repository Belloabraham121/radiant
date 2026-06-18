import type { NotificationChannelType, NotificationDeliveryStatus } from "@prisma/client";
import { createLogger } from "../../shared/logger.js";
import {
  countStalePushSubscriptions,
  getNotificationDeliveryMetricsSince,
} from "./notification-event.repository.js";

const log = createLogger("notification-observability");

const STALE_PUSH_SUBSCRIPTION_DAYS = 90;
const METRICS_WINDOW_HOURS = 24;

export type NotificationDeliveryMetricRow = {
  channel: NotificationChannelType;
  status: NotificationDeliveryStatus;
  count: number;
};

export type NotificationObservabilitySnapshot = {
  window_hours: number;
  delivery: NotificationDeliveryMetricRow[];
  delivery_success_rate: number | null;
  stale_push_subscriptions: number;
  captured_at: string;
};

export function logNotificationDeliveryOutcome(input: {
  channel: NotificationChannelType;
  status: NotificationDeliveryStatus;
  durationMs?: number;
  eventId?: string;
  error?: string | null;
}): void {
  log.info("notification_delivery_outcome", {
    channel: input.channel,
    status: input.status,
    duration_ms: input.durationMs,
    event_id: input.eventId,
    error: input.error ?? undefined,
  });
}

export function logNotificationEvaluatorRun(input: {
  evaluator_kind: "poll" | "schedule" | "event";
  evaluator_key?: string;
  duration_ms: number;
  rules_evaluated: number;
  emitted: number;
  suppressed: number;
  duplicates: number;
  errors: number;
}): void {
  log.info("notification_evaluator_run", {
    evaluator_kind: input.evaluator_kind,
    evaluator_key: input.evaluator_key,
    duration_ms: input.duration_ms,
    rules_evaluated: input.rules_evaluated,
    emitted: input.emitted,
    suppressed: input.suppressed,
    duplicates: input.duplicates,
    errors: input.errors,
  });
}

export function logStalePushSubscriptionRemoved(input: {
  userId: bigint;
  endpoint: string;
}): void {
  log.info("notification_stale_push_subscription_removed", {
    user_id: input.userId.toString(),
    endpoint: input.endpoint,
  });
}

function computeDeliverySuccessRate(rows: NotificationDeliveryMetricRow[]): number | null {
  const terminal = rows.filter((row) => row.status === "sent" || row.status === "failed");
  const total = terminal.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return null;
  }

  const sent = terminal
    .filter((row) => row.status === "sent")
    .reduce((sum, row) => sum + row.count, 0);

  return Math.round((sent / total) * 10_000) / 10_000;
}

export async function getNotificationObservabilitySnapshot(): Promise<NotificationObservabilitySnapshot> {
  const since = new Date(Date.now() - METRICS_WINDOW_HOURS * 60 * 60 * 1000);
  const staleBefore = new Date(Date.now() - STALE_PUSH_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

  const [deliveryRows, stalePushSubscriptions] = await Promise.all([
    getNotificationDeliveryMetricsSince(since),
    countStalePushSubscriptions(staleBefore),
  ]);

  return {
    window_hours: METRICS_WINDOW_HOURS,
    delivery: deliveryRows,
    delivery_success_rate: computeDeliverySuccessRate(deliveryRows),
    stale_push_subscriptions: stalePushSubscriptions,
    captured_at: new Date().toISOString(),
  };
}

export function resetNotificationObservabilityForTests(): void {
  // Reserved for future in-memory counters.
}
