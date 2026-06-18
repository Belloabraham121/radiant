import { getInngestConfig } from "../../config/inngest.js";
import { inngest } from "../../inngest/client.js";
import { NOTIFICATION_SCHEDULE_ONCE_EVENT } from "../../inngest/events.js";
import { logger } from "../../shared/logger.js";
import type { NotificationSchedule } from "../../services/notifications/notification-schema.types.js";
import { isOnceScheduleInFuture } from "../../services/notifications/notification-schedule.service.js";

export async function enqueueNotificationScheduleOnce(ruleId: string, schedule: NotificationSchedule): Promise<void> {
  if (schedule.kind !== "once" || !isOnceScheduleInFuture(schedule)) {
    return;
  }

  const config = getInngestConfig();
  if (!config.enabled) {
    return;
  }

  const at = new Date(schedule.at);

  await inngest.send({
    name: NOTIFICATION_SCHEDULE_ONCE_EVENT,
    data: { ruleId },
    id: `notification-schedule-once-${ruleId}`,
  });

  logger.info("Scheduled one-shot notification rule via Inngest", {
    ruleId,
    at: at.toISOString(),
    event: NOTIFICATION_SCHEDULE_ONCE_EVENT,
  });
}
