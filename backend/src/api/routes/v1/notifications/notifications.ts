import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { AppError } from "../../../../errors/app-error.js";
import { ok } from "../../../../utils/http-response.js";
import {
  createNotificationRuleForUser,
  deleteNotificationRuleForUser,
  getNotificationRuleForUser,
  getProjectNotificationSchemaForUser,
  listNotificationRulesForUser,
  updateNotificationRuleForUser,
} from "../../../../services/notifications/notification-rule.service.js";
import {
  getNotificationPreferencesForUser,
  patchNotificationPreferencesForUser,
} from "../../../../services/notifications/notification-preference.service.js";
import {
  listNotificationEventsForUser,
  markNotificationEventReadForUser,
  requireNotificationStreamUser,
} from "../../../../services/notifications/notification-event.service.js";
import { subscribeNotificationStream } from "../../../../services/notifications/notification-stream.service.js";
import { enqueueNotificationEmit } from "../../../../infrastructure/inngest/enqueue-notification-emit.js";
import { processNotificationEvent } from "../../../../services/notifications/notification-event-evaluator.service.js";
import { requireNotificationsInternalAuth } from "../../../middleware/notifications-internal-auth.js";
import { writeSseComment, writeSseEvent } from "../../../../utils/chat-sse.js";
import {
  getWebPushConfigForClient,
  listPushSubscriptionsForUser,
  subscribeWebPushForUser,
  unsubscribeWebPushForUser,
} from "../../../../services/notifications/notification-push-subscription.service.js";

const notificationChannelSchema = z.enum(["in_app", "web_push", "email"]);

const notificationScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: z.string().min(1) }),
  z.object({
    kind: z.literal("cron"),
    expression: z.string().min(1),
    timezone: z.string().min(1),
  }),
  z.object({
    kind: z.literal("interval"),
    every_seconds: z.number().int().positive(),
    until: z.string().min(1).optional(),
  }),
]);

const createRuleBodySchema = z.object({
  notification_type: z.string().min(1).max(120),
  condition: z.record(z.string(), z.unknown()).optional(),
  schedule: notificationScheduleSchema.optional(),
  channels: z.array(notificationChannelSchema).min(1).optional(),
  label: z.string().max(120).optional(),
  cooldown_seconds: z.number().int().min(0).max(86400).optional(),
  trigger_once: z.boolean().optional(),
  expires_at: z.string().optional(),
});

const updateRuleBodySchema = z.object({
  label: z.string().max(120).nullable().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  schedule: notificationScheduleSchema.nullable().optional(),
  channels: z.array(notificationChannelSchema).min(1).optional(),
  status: z.enum(["active", "paused"]).optional(),
  cooldown_seconds: z.number().int().min(0).max(86400).optional(),
  trigger_once: z.boolean().optional(),
  expires_at: z.string().nullable().optional(),
});

const listRulesQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  installation_id: z.string().uuid().optional(),
  status: z.enum(["active", "paused", "expired", "deleted"]).optional(),
  notification_type: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const patchPreferencesBodySchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().min(1).optional(),
  quiet_hours_start: z.string().nullable().optional(),
  quiet_hours_end: z.string().nullable().optional(),
  max_per_hour: z.coerce.number().int().min(1).max(1000).optional(),
  default_channels: z.array(notificationChannelSchema).min(1).optional(),
});

const listEventsQuerySchema = z.object({
  unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const emitNotificationBodySchema = z
  .object({
    user_id: z.string().regex(/^\d+$/).optional(),
    privy_user_id: z.string().min(1).optional(),
    rule_id: z.string().uuid().optional(),
    notification_type: z.string().min(1).max(120),
    title: z.string().min(1).max(500),
    body: z.string().min(1).max(5000),
    payload: z.record(z.string(), z.unknown()).optional(),
    idempotency_key: z.string().min(1).max(200).optional(),
    project_id: z.string().uuid().optional(),
    installation_id: z.string().uuid().optional(),
    channels: z.array(notificationChannelSchema).min(1).optional(),
  })
  .refine((body) => body.user_id != null || body.privy_user_id != null, {
    message: "user_id or privy_user_id is required",
  });

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

const subscribePushBodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  user_agent: z.string().max(500).optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((issue) => issue.message).join(", "));
  }
  return parsed.data;
}

function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((issue) => issue.message).join(", "));
  }
  return parsed.data;
}

export const notificationsRouter = Router();

notificationsRouter.get("/api/v1/notifications/preferences", requireAuth, async (req, res, next) => {
  try {
    const data = await getNotificationPreferencesForUser(req.user.privyUserId);
    return ok(req, res, data);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.patch("/api/v1/notifications/preferences", requireAuth, async (req, res, next) => {
  try {
    const body = parseBody(patchPreferencesBodySchema, req.body);
    const data = await patchNotificationPreferencesForUser(req.user.privyUserId, body);
    return ok(req, res, data);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.get("/api/v1/notifications/push/config", requireAuth, async (req, res, next) => {
  try {
    return ok(req, res, getWebPushConfigForClient());
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.get("/api/v1/notifications/push/subscriptions", requireAuth, async (req, res, next) => {
  try {
    const subscriptions = await listPushSubscriptionsForUser(req.user.privyUserId);
    return ok(req, res, { subscriptions });
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.post("/api/v1/notifications/push/subscribe", requireAuth, async (req, res, next) => {
  try {
    const body = parseBody(subscribePushBodySchema, req.body);
    const subscription = await subscribeWebPushForUser(req.user.privyUserId, {
      endpoint: body.endpoint,
      keys: body.keys,
      user_agent: body.user_agent ?? req.header("user-agent") ?? undefined,
    });
    return ok(req, res, subscription);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.delete(
  "/api/v1/notifications/push/subscribe/:subscriptionId",
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await unsubscribeWebPushForUser(
        req.user.privyUserId,
        req.params.subscriptionId,
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

notificationsRouter.get("/api/v1/notifications/events", requireAuth, async (req, res, next) => {
  try {
    const query = parseQuery(listEventsQuerySchema, req.query);
    const data = await listNotificationEventsForUser(req.user.privyUserId, {
      ...(query.unread !== undefined ? { unread: query.unread === "true" } : {}),
      limit: query.limit,
      offset: query.offset,
    });
    return ok(req, res, data);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.post(
  "/api/v1/notifications/events/:eventId/read",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await markNotificationEventReadForUser(
        req.user.privyUserId,
        req.params.eventId,
      );
      return ok(req, res, data);
    } catch (err) {
      return next(err);
    }
  },
);

notificationsRouter.get("/api/v1/notifications/stream", requireAuth, async (req, res, next) => {
  try {
    const userId = await requireNotificationStreamUser(req.user.privyUserId);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    writeSseEvent(res, "connected", { user_id: userId.toString() });

    const unsubscribe = subscribeNotificationStream(userId, (event) => {
      if (res.writableEnded) {
        return;
      }
      writeSseEvent(res, event.type, event);
    });

    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        return;
      }
      writeSseComment(res, "keepalive");
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    });
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.post(
  "/api/v1/internal/notifications/emit",
  requireNotificationsInternalAuth,
  async (req, res, next) => {
    try {
      const body = parseBody(emitNotificationBodySchema, req.body);
      const result = await enqueueNotificationEmit({
        ...(body.user_id ? { userId: BigInt(body.user_id) } : {}),
        ...(body.privy_user_id ? { privyUserId: body.privy_user_id } : {}),
        ...(body.rule_id ? { ruleId: body.rule_id } : {}),
        notificationType: body.notification_type,
        title: body.title,
        body: body.body,
        ...(body.payload ? { payload: body.payload } : {}),
        ...(body.idempotency_key ? { idempotencyKey: body.idempotency_key } : {}),
        ...(body.project_id ? { projectId: body.project_id } : {}),
        ...(body.installation_id ? { installationId: body.installation_id } : {}),
        ...(body.channels ? { channels: body.channels } : {}),
      });
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

notificationsRouter.post(
  "/api/v1/internal/notifications/events",
  requireNotificationsInternalAuth,
  async (req, res, next) => {
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
  },
);

notificationsRouter.get("/api/v1/notifications/rules", requireAuth, async (req, res, next) => {
  try {
    const query = parseQuery(listRulesQuerySchema, req.query);
    const data = await listNotificationRulesForUser(req.user.privyUserId, query);
    return ok(req, res, data);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.post("/api/v1/notifications/rules", requireAuth, async (req, res, next) => {
  try {
    const body = parseBody(createRuleBodySchema, req.body);
    const rule = await createNotificationRuleForUser(req.user.privyUserId, {}, body, {
      source: "user",
    });
    return ok(req, res, rule);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.get("/api/v1/notifications/rules/:ruleId", requireAuth, async (req, res, next) => {
  try {
    const rule = await getNotificationRuleForUser(req.user.privyUserId, req.params.ruleId);
    return ok(req, res, rule);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.patch("/api/v1/notifications/rules/:ruleId", requireAuth, async (req, res, next) => {
  try {
    const body = parseBody(updateRuleBodySchema, req.body);
    const rule = await updateNotificationRuleForUser(req.user.privyUserId, req.params.ruleId, body);
    return ok(req, res, rule);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.delete("/api/v1/notifications/rules/:ruleId", requireAuth, async (req, res, next) => {
  try {
    const result = await deleteNotificationRuleForUser(req.user.privyUserId, req.params.ruleId);
    return ok(req, res, result);
  } catch (err) {
    return next(err);
  }
});

notificationsRouter.get(
  "/api/v1/projects/:projectId/notifications/schema",
  requireAuth,
  async (req, res, next) => {
    try {
      const schema = await getProjectNotificationSchemaForUser(req.user.privyUserId, req.params.projectId);
      return ok(req, res, { schema });
    } catch (err) {
      return next(err);
    }
  },
);

notificationsRouter.get(
  "/api/v1/projects/:projectId/notifications/rules",
  requireAuth,
  async (req, res, next) => {
    try {
      const query = parseQuery(listRulesQuerySchema, req.query);
      const data = await listNotificationRulesForUser(req.user.privyUserId, {
        ...query,
        project_id: req.params.projectId,
      });
      return ok(req, res, data);
    } catch (err) {
      return next(err);
    }
  },
);

notificationsRouter.post(
  "/api/v1/projects/:projectId/notifications/rules",
  requireAuth,
  async (req, res, next) => {
    try {
      const body = parseBody(createRuleBodySchema, req.body);
      const rule = await createNotificationRuleForUser(
        req.user.privyUserId,
        { projectId: req.params.projectId },
        body,
        { source: "app" },
      );
      return ok(req, res, rule);
    } catch (err) {
      return next(err);
    }
  },
);

notificationsRouter.get(
  "/api/v1/installations/:installationId/notifications/rules",
  requireAuth,
  async (req, res, next) => {
    try {
      const query = parseQuery(listRulesQuerySchema, req.query);
      const data = await listNotificationRulesForUser(req.user.privyUserId, {
        ...query,
        installation_id: req.params.installationId,
      });
      return ok(req, res, data);
    } catch (err) {
      return next(err);
    }
  },
);

notificationsRouter.post(
  "/api/v1/installations/:installationId/notifications/rules",
  requireAuth,
  async (req, res, next) => {
    try {
      const body = parseBody(createRuleBodySchema, req.body);
      const rule = await createNotificationRuleForUser(
        req.user.privyUserId,
        { installationId: req.params.installationId },
        body,
        { source: "app" },
      );
      return ok(req, res, rule);
    } catch (err) {
      return next(err);
    }
  },
);
