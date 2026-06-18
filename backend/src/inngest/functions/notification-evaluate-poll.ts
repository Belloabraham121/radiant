import { inngest } from "../client.js";
import { runPollEvaluatorCycle } from "../../services/notifications/notification-poll-evaluator.service.js";
import { getNotificationsConfig } from "../../config/notifications.js";

export const notificationEvaluatePollFunction = inngest.createFunction(
  {
    id: "notification-evaluate-poll",
    name: "Radiant notification poll evaluators",
    triggers: [{ cron: getNotificationsConfig().pollCron }],
    retries: 1,
  },
  async ({ step }) => {
    await step.run("evaluate-poll-rules", async () => {
      return runPollEvaluatorCycle();
    });
  },
);
