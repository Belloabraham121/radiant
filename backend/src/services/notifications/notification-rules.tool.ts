import { z } from "zod";
import {
  createNotificationRuleForUser,
  deleteNotificationRuleForUser,
  listNotificationRulesForUser,
  updateNotificationRuleForUser,
} from "./notification-rule.service.js";
import { mergePinnedAppScopeIntoNotificationRule } from "../projects/pinned-app-scope.types.js";
import { coerceMislabeledAppScopeFields } from "../projects/app-scope-resolver.service.js";
import type { AgentToolOptions } from "../agent/execute-transaction-context.js";

export const CREATE_NOTIFICATION_RULE_TOOL_NAME = "create_notification_rule" as const;
export const LIST_NOTIFICATION_RULES_TOOL_NAME = "list_notification_rules" as const;
export const UPDATE_NOTIFICATION_RULE_TOOL_NAME = "update_notification_rule" as const;
export const DELETE_NOTIFICATION_RULE_TOOL_NAME = "delete_notification_rule" as const;

const notificationChannelSchema = z.enum(["in_app", "web_push", "email"]);

const notificationScheduleSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("once"),
      at: z.string().min(1).optional(),
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
      until: z.string().min(1).optional(),
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

const notificationScopeSchema = z.preprocess(
  (input) => {
    if (typeof input !== "object" || input === null) {
      return input;
    }
    return coerceMislabeledAppScopeFields(input as Record<string, unknown>);
  },
  z.object({
    project_id: z.string().uuid().optional(),
    installation_id: z.string().uuid().optional(),
  }),
);

export const createNotificationRuleInputSchema = notificationScopeSchema.and(
  z.object({
    notification_type: z.string().min(1).max(120),
    condition: z.record(z.string(), z.unknown()).optional(),
    schedule: notificationScheduleSchema.optional(),
    channels: z.array(notificationChannelSchema).min(1).optional(),
    label: z.string().max(120).optional(),
    cooldown_seconds: z.number().int().min(0).max(86400).optional(),
    trigger_once: z.boolean().optional(),
    expires_at: z.string().optional(),
  }),
);

export const listNotificationRulesInputSchema = notificationScopeSchema.and(
  z.object({
    status: z.enum(["active", "paused", "expired"]).optional(),
    notification_type: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }),
);

export const updateNotificationRuleInputSchema = z.object({
  rule_id: z.string().uuid(),
  label: z.string().max(120).nullable().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  schedule: notificationScheduleSchema.nullable().optional(),
  channels: z.array(notificationChannelSchema).min(1).optional(),
  status: z.enum(["active", "paused"]).optional(),
  cooldown_seconds: z.number().int().min(0).max(86400).optional(),
  trigger_once: z.boolean().optional(),
  expires_at: z.string().nullable().optional(),
});

export const deleteNotificationRuleInputSchema = z.object({
  rule_id: z.string().uuid(),
});

export const createNotificationRuleToolDefinition = {
  name: CREATE_NOTIFICATION_RULE_TOOL_NAME,
  description:
    "Create a notification alert rule for the user. Use when they ask to be notified, reminded, or alerted about anything an app supports (bids, thresholds, deadlines, custom events). " +
    "For app-scoped alerts, pass project_id or installation_id (or rely on pinned app scope). " +
    "Call query_chain project_notification_schema first when unsure which notification_type and condition fields are available.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: { type: "string", description: "Saved project UUID for app-scoped alerts." },
      installation_id: { type: "string", description: "Installed app UUID." },
      notification_type: {
        type: "string",
        description:
          "Full type key (app_id.type) or type slug when project scope is set — from the app's lib/radiant-notifications.ts manifest.",
      },
      condition: {
        type: "object",
        description: "Thresholds matching the type's condition_schema.",
        additionalProperties: true,
      },
      schedule: {
        type: "object",
        description:
          "Required for schedule trigger kinds. One-shot: { kind: \"once\", in_seconds: 10 } for relative delays (preferred for \"in N seconds/minutes\"), or { kind: \"once\", at: \"<ISO UTC>\" } for absolute times. Cron/interval also supported.",
        additionalProperties: true,
      },
      channels: {
        type: "array",
        items: { type: "string", enum: ["in_app", "web_push", "email"] },
      },
      label: { type: "string", description: "Optional user-facing label." },
      cooldown_seconds: { type: "number" },
      trigger_once: { type: "boolean" },
      expires_at: { type: "string", description: "ISO datetime when the rule should expire." },
    },
    required: ["notification_type"],
    additionalProperties: false,
  },
};

export const listNotificationRulesToolDefinition = {
  name: LIST_NOTIFICATION_RULES_TOOL_NAME,
  description: "List the user's notification alert rules, optionally filtered by project or installation scope.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: { type: "string" },
      installation_id: { type: "string" },
      status: { type: "string", enum: ["active", "paused", "expired"] },
      notification_type: { type: "string" },
      limit: { type: "number" },
      offset: { type: "number" },
    },
    additionalProperties: false,
  },
};

export const updateNotificationRuleToolDefinition = {
  name: UPDATE_NOTIFICATION_RULE_TOOL_NAME,
  description:
    "Update or pause a notification rule — change thresholds, schedule, channels, or set status to paused/active.",
  input_schema: {
    type: "object" as const,
    properties: {
      rule_id: { type: "string" },
      label: { type: "string" },
      condition: { type: "object", additionalProperties: true },
      schedule: { type: "object", additionalProperties: true },
      channels: {
        type: "array",
        items: { type: "string", enum: ["in_app", "web_push", "email"] },
      },
      status: { type: "string", enum: ["active", "paused"] },
      cooldown_seconds: { type: "number" },
      trigger_once: { type: "boolean" },
      expires_at: { type: "string" },
    },
    required: ["rule_id"],
    additionalProperties: false,
  },
};

export const deleteNotificationRuleToolDefinition = {
  name: DELETE_NOTIFICATION_RULE_TOOL_NAME,
  description: "Delete (disable) a notification alert rule by rule_id.",
  input_schema: {
    type: "object" as const,
    properties: {
      rule_id: { type: "string" },
    },
    required: ["rule_id"],
    additionalProperties: false,
  },
};

export const notificationRuleToolDefinitions = [
  createNotificationRuleToolDefinition,
  listNotificationRulesToolDefinition,
  updateNotificationRuleToolDefinition,
  deleteNotificationRuleToolDefinition,
] as const;

export async function runCreateNotificationRuleTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: AgentToolOptions = {},
) {
  const parsed = mergePinnedAppScopeIntoNotificationRule(
    createNotificationRuleInputSchema.parse(input),
    context.pinnedAppScope,
  );

  return createNotificationRuleForUser(
    privyUserId,
    {
      projectId: parsed.project_id,
      installationId: parsed.installation_id,
    },
    {
      notification_type: parsed.notification_type,
      condition: parsed.condition,
      schedule: parsed.schedule,
      channels: parsed.channels,
      label: parsed.label,
      cooldown_seconds: parsed.cooldown_seconds,
      trigger_once: parsed.trigger_once,
      expires_at: parsed.expires_at,
    },
    { sessionId: context.sessionId, source: "agent" },
  );
}

export async function runListNotificationRulesTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: AgentToolOptions = {},
) {
  const parsed = mergePinnedAppScopeIntoNotificationRule(
    listNotificationRulesInputSchema.parse(input),
    context.pinnedAppScope,
  );

  return listNotificationRulesForUser(privyUserId, {
    project_id: parsed.project_id,
    installation_id: parsed.installation_id,
    status: parsed.status,
    notification_type: parsed.notification_type,
    limit: parsed.limit,
    offset: parsed.offset,
  });
}

export async function runUpdateNotificationRuleTool(
  privyUserId: string,
  input: Record<string, unknown>,
) {
  const parsed = updateNotificationRuleInputSchema.parse(input);
  return updateNotificationRuleForUser(privyUserId, parsed.rule_id, {
    label: parsed.label,
    condition: parsed.condition,
    schedule: parsed.schedule,
    channels: parsed.channels,
    status: parsed.status,
    cooldown_seconds: parsed.cooldown_seconds,
    trigger_once: parsed.trigger_once,
    expires_at: parsed.expires_at,
  });
}

export async function runDeleteNotificationRuleTool(
  privyUserId: string,
  input: Record<string, unknown>,
) {
  const parsed = deleteNotificationRuleInputSchema.parse(input);
  return deleteNotificationRuleForUser(privyUserId, parsed.rule_id);
}
