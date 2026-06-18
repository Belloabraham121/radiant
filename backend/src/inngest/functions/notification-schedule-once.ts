import { inngest } from "../client.js";
import { NOTIFICATION_SCHEDULE_ONCE_EVENT } from "../events.js";
import { findNotificationRuleById } from "../../services/notifications/notification-rule.repository.js";
import { fireScheduleRuleById } from "../../services/notifications/notification-schedule-evaluator.service.js";
import type { NotificationSchedule } from "../../services/notifications/notification-schema.types.js";

export const notificationScheduleOnceFunction = inngest.createFunction(
  {
    id: "notification-schedule-once",
    name: "Radiant notification one-shot schedule",
    triggers: [{ event: NOTIFICATION_SCHEDULE_ONCE_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const rule = await step.run("load-rule", async () => findNotificationRuleById(event.data.ruleId));

    if (!rule || rule.status !== "active" || rule.trigger_kind !== "schedule" || !rule.schedule) {
      return { skipped: true, reason: "rule_not_active" };
    }

    const schedule = rule.schedule as NotificationSchedule;
    if (schedule.kind !== "once") {
      return { skipped: true, reason: "not_once_schedule" };
    }

    await step.sleepUntil("wait-until-fire-time", new Date(schedule.at));

    const refreshed = await step.run("reload-rule", async () => findNotificationRuleById(event.data.ruleId));
    if (!refreshed || refreshed.status !== "active") {
      return { skipped: true, reason: "rule_no_longer_active" };
    }

    return step.run("fire-scheduled-rule", async () => fireScheduleRuleById(event.data.ruleId));
  },
);
