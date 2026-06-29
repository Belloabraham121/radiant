import { z } from "zod";
import type { AppActionParamField } from "../agent/onchain-actions/app-action.types.js";
import { validateNotificationCondition } from "./notification-condition.validator.js";
import {
  normalizeNotificationScheduleInput,
  validateCronScheduleExpression,
  validateScheduleSemantics,
} from "./notification-schedule.service.js";
import {
  getPlatformNotificationType,
  isPlatformNotificationType,
} from "./platform-notification-registry.js";
import {
  PROJECT_NOTIFICATION_SCHEMA_VERSION,
  type NotificationChannel,
  type NotificationSchedule,
  type NotificationTypeDefinition,
  type NotificationValidationError,
  type ParsedNotificationTypeKey,
  type ProjectNotificationSchema,
} from "./notification-schema.types.js";

export type ProjectNotificationSchemaSource = {
  id: string;
  notification_schema?: unknown | null;
};

const notificationChannelSchema = z.enum(["in_app", "web_push", "email"]);

const appActionParamFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "array", "object"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

const notificationPresentationSchema = z
  .object({
    title_template: z.string().optional(),
    body_template: z.string().optional(),
    deep_link_template: z.string().optional(),
  })
  .optional();

const notificationTypeDefinitionSchema = z.object({
  type: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "type must be a lowercase slug"),
  label: z.string().min(1),
  description: z.string().min(1),
  trigger_kind: z.enum(["event", "poll", "schedule"]),
  condition_schema: z.array(appActionParamFieldSchema),
  default_channels: z.array(notificationChannelSchema).min(1),
  poll_interval_seconds: z.number().int().positive().optional(),
  evaluator: z.string().min(1).optional(),
  presentation: notificationPresentationSchema,
});

export const projectNotificationSchemaSchema = z.object({
  schema_version: z.literal(PROJECT_NOTIFICATION_SCHEMA_VERSION),
  app_id: z.string().min(1),
  types: z.array(notificationTypeDefinitionSchema),
});

const isoDateTimeString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid ISO datetime",
});

export const notificationScheduleSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("once"),
      at: isoDateTimeString.optional(),
      in_seconds: z.number().int().positive().max(86_400).optional(),
    }),
    z.object({
      kind: z.literal("cron"),
      expression: z.string().min(1),
      timezone: z.string().min(1),
    }),
    z.object({
      kind: z.literal("interval"),
      every_seconds: z.number().int().positive(),
      until: isoDateTimeString.optional(),
    }),
  ])
  .superRefine((schedule, ctx) => {
    if (schedule.kind === "once" && schedule.at == null && schedule.in_seconds == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "once schedule requires at (ISO UTC) or in_seconds",
      });
    }
  });

export const notificationChannelsSchema = z.array(notificationChannelSchema).min(1);

const TYPE_SLUG_PATTERN = /^[a-z][a-z0-9_]*$/;

export function formatNotificationTypeKey(appId: string, typeSlug: string): string {
  return `${appId}.${typeSlug}`;
}

export function parseNotificationTypeKey(notificationType: string): ParsedNotificationTypeKey | null {
  const trimmed = notificationType.trim();
  if (!trimmed) {
    return null;
  }

  if (isPlatformNotificationType(trimmed)) {
    const platformDefinition = getPlatformNotificationType(trimmed);
    return {
      scope: "platform",
      notification_type: trimmed,
      platform_type: platformDefinition?.type ?? trimmed.split(".").slice(2).join("."),
    };
  }

  const dotIndex = trimmed.indexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return null;
  }

  const appId = trimmed.slice(0, dotIndex);
  const type = trimmed.slice(dotIndex + 1);
  if (!TYPE_SLUG_PATTERN.test(type)) {
    return null;
  }

  return {
    scope: "app",
    notification_type: trimmed,
    app_id: appId,
    type,
  };
}

export function parseStoredProjectNotificationSchema(
  value: unknown,
): ProjectNotificationSchema | null {
  const parsed = projectNotificationSchemaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolveStoredProjectNotificationSchema(
  project: ProjectNotificationSchemaSource,
): ProjectNotificationSchema | null {
  const stored = parseStoredProjectNotificationSchema(project.notification_schema);
  if (!stored) {
    return null;
  }

  if (stored.app_id !== project.id) {
    return {
      ...stored,
      app_id: project.id,
    };
  }

  return stored;
}

export function findAppNotificationTypeDefinition(
  schema: ProjectNotificationSchema,
  notificationType: string,
): NotificationTypeDefinition | null {
  const parsed = parseNotificationTypeKey(notificationType);
  if (!parsed || parsed.scope !== "app") {
    return null;
  }

  if (parsed.app_id !== schema.app_id) {
    return null;
  }

  const definition = schema.types.find((entry) => entry.type === parsed.type);
  return definition ?? null;
}

export function resolveNotificationTypeDefinition(input: {
  notification_type: string;
  project?: ProjectNotificationSchemaSource | null;
}): NotificationTypeDefinition | null {
  const platform = getPlatformNotificationType(input.notification_type);
  if (platform) {
    return platform;
  }

  if (!input.project) {
    return null;
  }

  const schema = resolveStoredProjectNotificationSchema(input.project);
  if (!schema) {
    return null;
  }

  return findAppNotificationTypeDefinition(schema, input.notification_type);
}

export function validateNotificationSchedule(
  schedule: unknown,
  options?: { now?: Date; requireFutureOnce?: boolean },
): { success: true; data: NotificationSchedule } | { success: false; errors: NotificationValidationError[] } {
  const parsed = notificationScheduleSchema.safeParse(schedule);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "INVALID_SCHEDULE",
        message: issue.message,
        path: issue.path.length > 0 ? issue.path.join(".") : undefined,
      })),
    };
  }

  const now = options?.now ?? new Date();
  const normalized = normalizeNotificationScheduleInput(parsed.data, now);
  if (!normalized.ok) {
    return {
      success: false,
      errors: [{ code: "INVALID_SCHEDULE", message: normalized.message }],
    };
  }

  const semantics = validateScheduleSemantics(normalized.schedule, {
    now,
    requireFutureOnce: options?.requireFutureOnce ?? true,
  });
  if (!semantics.ok) {
    return {
      success: false,
      errors: [{ code: "INVALID_SCHEDULE", message: semantics.message }],
    };
  }

  if (parsed.data.kind === "cron" && !validateCronScheduleExpression(parsed.data.expression, parsed.data.timezone)) {
    return {
      success: false,
      errors: [{ code: "INVALID_CRON", message: "Invalid cron expression or timezone" }],
    };
  }

  return { success: true, data: normalized.schedule };
}

export function validateNotificationChannels(
  channels: unknown,
): { success: true; data: NotificationChannel[] } | { success: false; errors: NotificationValidationError[] } {
  const parsed = notificationChannelsSchema.safeParse(channels);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "INVALID_CHANNELS",
        message: issue.message,
        path: issue.path.length > 0 ? issue.path.join(".") : undefined,
      })),
    };
  }
  return { success: true, data: parsed.data };
}

export function validateRuleConditionForType(input: {
  notification_type: string;
  condition: unknown;
  project?: ProjectNotificationSchemaSource | null;
}):
  | { success: true; data: Record<string, unknown>; type: NotificationTypeDefinition }
  | { success: false; errors: NotificationValidationError[] } {
  const typeDefinition = resolveNotificationTypeDefinition({
    notification_type: input.notification_type,
    project: input.project,
  });

  if (!typeDefinition) {
    return {
      success: false,
      errors: [
        {
          code: "UNKNOWN_NOTIFICATION_TYPE",
          message: `Unknown notification type: ${input.notification_type}`,
        },
      ],
    };
  }

  const parsed = parseNotificationTypeKey(input.notification_type);
  if (parsed?.scope === "app" && input.project) {
    const schema = resolveStoredProjectNotificationSchema(input.project);
    if (!schema) {
      return {
        success: false,
        errors: [
          {
            code: "MISSING_NOTIFICATION_SCHEMA",
            message: "Project has no notification_schema for app-scoped notification types",
          },
        ],
      };
    }

    if (parsed.app_id !== schema.app_id && parsed.app_id !== input.project.id) {
      return {
        success: false,
        errors: [
          {
            code: "NOTIFICATION_TYPE_APP_MISMATCH",
            message: `Notification type app_id "${parsed.app_id}" does not match project`,
          },
        ],
      };
    }
  }

  const conditionResult = validateNotificationCondition(
    input.condition,
    typeDefinition.condition_schema as AppActionParamField[],
  );
  if (!conditionResult.success) {
    return conditionResult;
  }

  return {
    success: true,
    data: conditionResult.data,
    type: typeDefinition,
  };
}

export function validateNotificationRuleDraft(input: {
  notification_type: string;
  trigger_kind: NotificationTypeDefinition["trigger_kind"];
  condition?: unknown;
  schedule?: unknown;
  channels?: unknown;
  project?: ProjectNotificationSchemaSource | null;
}): { success: true } | { success: false; errors: NotificationValidationError[] } {
  const typeDefinition = resolveNotificationTypeDefinition({
    notification_type: input.notification_type,
    project: input.project,
  });

  if (!typeDefinition) {
    return {
      success: false,
      errors: [
        {
          code: "UNKNOWN_NOTIFICATION_TYPE",
          message: `Unknown notification type: ${input.notification_type}`,
        },
      ],
    };
  }

  if (typeDefinition.trigger_kind !== input.trigger_kind) {
    return {
      success: false,
      errors: [
        {
          code: "TRIGGER_KIND_MISMATCH",
          message: `Notification type "${input.notification_type}" requires trigger_kind "${typeDefinition.trigger_kind}"`,
        },
      ],
    };
  }

  const conditionResult = validateRuleConditionForType({
    notification_type: input.notification_type,
    condition: input.condition ?? {},
    project: input.project,
  });
  if (!conditionResult.success) {
    return conditionResult;
  }

  if (input.trigger_kind === "schedule") {
    if (input.schedule == null) {
      return {
        success: false,
        errors: [{ code: "MISSING_SCHEDULE", message: "schedule is required for schedule trigger_kind" }],
      };
    }
    const scheduleResult = validateNotificationSchedule(input.schedule);
    if (!scheduleResult.success) {
      return scheduleResult;
    }
  } else if (input.schedule != null) {
    return {
      success: false,
      errors: [
        {
          code: "UNEXPECTED_SCHEDULE",
          message: "schedule is only allowed when trigger_kind is schedule",
        },
      ],
    };
  }

  if (input.channels != null) {
    const channelsResult = validateNotificationChannels(input.channels);
    if (!channelsResult.success) {
      return channelsResult;
    }
  }

  return { success: true };
}

/** Response shape for future GET .../projects/:id/notifications/schema. */
export function buildProjectNotificationSchemaResponse(
  project: ProjectNotificationSchemaSource,
): ProjectNotificationSchema | null {
  return resolveStoredProjectNotificationSchema(project);
}
