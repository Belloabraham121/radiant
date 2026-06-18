import { inngest } from "../client.js";
import { runScheduleEvaluatorCycle } from "../../services/notifications/notification-schedule-evaluator.service.js";
import { getNotificationsConfig } from "../../config/notifications.js";

export const notificationEvaluateScheduleFunction = inngest.createFunction(
  {
    id: "notification-evaluate-schedule",
    name: "Radiant notification schedule evaluators",
    triggers: [{ cron: getNotificationsConfig().scheduleCron }],
    retries: 1,
  },
  async ({ step }) => {
    return step.run("evaluate-schedule-rules", async () => runScheduleEvaluatorCycle());
  },
);
