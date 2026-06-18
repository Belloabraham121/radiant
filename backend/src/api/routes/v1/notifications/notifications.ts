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
