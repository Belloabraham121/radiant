import { inngest } from "../client.js";
import { NOTIFICATION_EMIT_EVENT } from "../events.js";
import { deliverNotification } from "../../services/notifications/notification-delivery.service.js";

export const notificationDeliverFunction = inngest.createFunction(
  {
    id: "notification-deliver",
    name: "Radiant notification deliver",
    triggers: [{ event: NOTIFICATION_EMIT_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    await step.run("deliver-notification", async () => {
      const data = event.data;
      await deliverNotification({
        ...(data.userId ? { userId: BigInt(data.userId) } : {}),
        ...(data.privyUserId ? { privyUserId: data.privyUserId } : {}),
        ...(data.ruleId ? { ruleId: data.ruleId } : {}),
        notificationType: data.notificationType,
        title: data.title,
        body: data.body,
        ...(data.payload ? { payload: data.payload } : {}),
        ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
        ...(data.projectId ? { projectId: data.projectId } : {}),
        ...(data.installationId ? { installationId: data.installationId } : {}),
        ...(data.channels ? { channels: data.channels } : {}),
      });
    });
  },
);
