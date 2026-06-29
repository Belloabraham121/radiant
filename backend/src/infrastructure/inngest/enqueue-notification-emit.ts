import { getInngestConfig } from "../../config/inngest.js";
import { inngest } from "../../inngest/client.js";
import { NOTIFICATION_EMIT_EVENT } from "../../inngest/events.js";
import { logger } from "../../shared/logger.js";
import {
  deliverNotification,
  type EmitNotificationInput,
} from "../../services/notifications/notification-delivery.service.js";

export async function enqueueNotificationEmit(
  input: EmitNotificationInput,
): Promise<{ queued: boolean; result?: Awaited<ReturnType<typeof deliverNotification>> }> {
  const config = getInngestConfig();
  if (!config.enabled) {
    const result = await deliverNotification(input);
    return { queued: false, result };
  }

  await inngest.send({
    name: NOTIFICATION_EMIT_EVENT,
    data: {
      ...(input.userId !== undefined ? { userId: input.userId.toString() } : {}),
      ...(input.privyUserId ? { privyUserId: input.privyUserId } : {}),
      ...(input.ruleId ? { ruleId: input.ruleId } : {}),
      notificationType: input.notificationType,
      title: input.title,
      body: input.body,
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.channels ? { channels: input.channels } : {}),
    },
    ...(input.idempotencyKey ? { id: `notification-${input.idempotencyKey}` } : {}),
  });

  logger.info("Notification emit enqueued via Inngest", {
    notificationType: input.notificationType,
    event: NOTIFICATION_EMIT_EVENT,
  });

  return { queued: true };
}
