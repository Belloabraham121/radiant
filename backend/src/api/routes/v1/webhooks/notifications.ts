import { Router } from "express";
import { z } from "zod";
import { requireNotificationsInternalAuth } from "../../../middleware/notifications-internal-auth.js";
import { AppError } from "../../../../errors/app-error.js";
import { ok } from "../../../../utils/http-response.js";
import { processNotificationEvent } from "../../../../services/notifications/notification-event-evaluator.service.js";

const notificationEventIngressBodySchema = z.object({
  notification_type: z.string().min(1).max(120),
  data: z.record(z.string(), z.unknown()).default({}),
  project_id: z.string().uuid().optional(),
  installation_id: z.string().uuid().optional(),
  user_id: z.string().regex(/^\d+$/).optional(),
  idempotency_key: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(5000).optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((issue) => issue.message).join(", "));
  }
  return parsed.data;
}

export const notificationsWebhookRouter = Router();

/** Authenticated webhook ingress for external event-driven notifications. */
notificationsWebhookRouter.post("/events", requireNotificationsInternalAuth, async (req, res, next) => {
  try {
    const body = parseBody(notificationEventIngressBodySchema, req.body);
    const result = await processNotificationEvent({
      notificationType: body.notification_type,
      data: body.data,
      ...(body.project_id ? { projectId: body.project_id } : {}),
      ...(body.installation_id ? { installationId: body.installation_id } : {}),
      ...(body.user_id ? { userId: BigInt(body.user_id) } : {}),
      ...(body.idempotency_key ? { idempotencyKey: body.idempotency_key } : {}),
      ...(body.title ? { title: body.title } : {}),
      ...(body.body ? { body: body.body } : {}),
    });
    return ok(req, res, result);
  } catch (err) {
    return next(err);
  }
});
