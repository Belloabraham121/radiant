import type {
  NotificationRule,
  NotificationRuleSource,
  NotificationRuleStatus,
} from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import {
  buildProjectNotificationSchemaResponse,
  formatNotificationTypeKey,
  resolveNotificationTypeDefinition,
  resolveStoredProjectNotificationSchema,
  validateNotificationChannels,
  validateNotificationRuleDraft,
  validateNotificationSchedule,
} from "./notification-schema.service.js";
import type {
  NotificationChannel,
  NotificationSchedule,
  ProjectNotificationSchema,
} from "./notification-schema.types.js";
import type { NotificationScheduleInput } from "./notification-schedule.service.js";
import {
  createNotificationRule,
  findNotificationRuleForUser,
  listNotificationRules,
  softDeleteNotificationRule,
  updateNotificationRule,
} from "./notification-rule.repository.js";
import { resolveNotificationScope } from "./notification-scope.service.js";
import { isPlatformNotificationType } from "./platform-notification-registry.js";
import { enqueueNotificationScheduleOnce } from "../../infrastructure/inngest/enqueue-notification-schedule-once.js";

function defaultChannelsForType(typeDefinition: {
  default_channels: NotificationChannel[];
}): NotificationChannel[] {
  return typeDefinition.default_channels.length > 0
    ? typeDefinition.default_channels
    : (["in_app", "web_push"] as NotificationChannel[]);
}

/** Union explicit channels with type defaults so agents cannot drop web_push silently. */
function mergeRuleChannels(
  inputChannels: NotificationChannel[] | undefined,
  typeDefinition: { default_channels: NotificationChannel[] },
): NotificationChannel[] {
  const defaults = defaultChannelsForType(typeDefinition);
  if (!inputChannels?.length) {
    return defaults;
  }
  return [...new Set([...defaults, ...inputChannels])];
}

export type NotificationRuleRecord = {
  id: string;
  user_id: string;
  project_id: string | null;
  installation_id: string | null;
  source: NotificationRuleSource;
  session_id: string | null;
  label: string | null;
  notification_type: string;
  trigger_kind: string;
  condition: Record<string, unknown>;
  schedule: NotificationSchedule | null;
  channels: NotificationChannel[];
  status: NotificationRuleStatus;
  cooldown_seconds: number;
  trigger_once: boolean;
  last_triggered_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateNotificationRuleInput = {
  notification_type: string;
  condition?: Record<string, unknown>;
  schedule?: NotificationScheduleInput;
  channels?: NotificationChannel[];
  label?: string;
  cooldown_seconds?: number;
  trigger_once?: boolean;
  expires_at?: string;
  source?: NotificationRuleSource;
  session_id?: string;
};

export type UpdateNotificationRuleInput = {
  label?: string | null;
  condition?: Record<string, unknown>;
  schedule?: NotificationScheduleInput | null;
  channels?: NotificationChannel[];
  status?: NotificationRuleStatus;
  cooldown_seconds?: number;
  trigger_once?: boolean;
  expires_at?: string | null;
};

export type ListNotificationRulesInput = {
  project_id?: string;
  installation_id?: string;
  status?: NotificationRuleStatus;
  notification_type?: string;
  limit?: number;
  offset?: number;
};

function toRuleRecord(rule: NotificationRule): NotificationRuleRecord {
  return {
    id: rule.id,
    user_id: rule.user_id.toString(),
    project_id: rule.project_id,
    installation_id: rule.installation_id,
    source: rule.source,
    session_id: rule.session_id,
    label: rule.label,
    notification_type: rule.notification_type,
    trigger_kind: rule.trigger_kind,
    condition: rule.condition as Record<string, unknown>,
    schedule: (rule.schedule as NotificationSchedule | null) ?? null,
    channels: rule.channels as NotificationChannel[],
    status: rule.status,
    cooldown_seconds: rule.cooldown_seconds,
    trigger_once: rule.trigger_once,
    last_triggered_at: rule.last_triggered_at?.toISOString() ?? null,
    expires_at: rule.expires_at?.toISOString() ?? null,
    created_at: rule.created_at.toISOString(),
    updated_at: rule.updated_at.toISOString(),
  };
}

function parseExpiresAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "INVALID_EXPIRES_AT", "expires_at must be a valid ISO datetime");
  }
  return date;
}

function resolveNotificationTypeInput(
  notificationType: string,
  project: { id: string; notification_schema?: unknown | null } | null,
): string {
  const trimmed = notificationType.trim();
  if (trimmed.includes(".") || isPlatformNotificationType(trimmed)) {
    return trimmed;
  }

  const schema = project ? resolveStoredProjectNotificationSchema(project) : null;
  if (!schema) {
    throw new AppError(
      400,
      "NOTIFICATION_TYPE_REQUIRES_SCHEMA",
      "Short notification type slugs require a project with notification_schema — pass the full type key or use a scoped project route.",
    );
  }

  return formatNotificationTypeKey(schema.app_id, trimmed);
}

function assertValidationErrors(
  result: { success: false; errors: { message: string }[] },
): never {
  throw new AppError(400, "INVALID_NOTIFICATION_RULE", result.errors.map((e) => e.message).join("; "), {
    errors: result.errors,
  });
}

function buildProjectNotificationSchema(
  project: { id: string; notification_schema?: unknown | null },
): ProjectNotificationSchema | null {
  return buildProjectNotificationSchemaResponse(project);
}

export async function createNotificationRuleForUser(
  privyUserId: string,
  scopeParams: { projectId?: string; installationId?: string },
  input: CreateNotificationRuleInput,
  options: { sessionId?: string; source?: NotificationRuleSource } = {},
): Promise<NotificationRuleRecord> {
  const scope = await resolveNotificationScope(privyUserId, scopeParams);
  const notificationType = resolveNotificationTypeInput(input.notification_type, scope.project);

  const typeDefinition = resolveNotificationTypeDefinition({
    notification_type: notificationType,
    project: scope.project,
  });
  if (!typeDefinition) {
    throw new AppError(404, "UNKNOWN_NOTIFICATION_TYPE", `Unknown notification type: ${notificationType}`);
  }

  if (!isPlatformNotificationType(notificationType) && !scope.projectId) {
    throw new AppError(
      400,
      "PROJECT_SCOPE_REQUIRED",
      "App-scoped notification rules require project_id or installation_id scope",
    );
  }

  const channels = mergeRuleChannels(input.channels, typeDefinition);

  const channelsResult = validateNotificationChannels(channels);
  if (!channelsResult.success) {
    assertValidationErrors(channelsResult);
  }

  let resolvedSchedule: NotificationSchedule | undefined;
  if (input.schedule != null) {
    const scheduleResult = validateNotificationSchedule(input.schedule);
    if (!scheduleResult.success) {
      assertValidationErrors(scheduleResult);
    }
    resolvedSchedule = scheduleResult.data;
  }

  const draftResult = validateNotificationRuleDraft({
    notification_type: notificationType,
    trigger_kind: typeDefinition.trigger_kind,
    condition: input.condition ?? {},
    schedule: resolvedSchedule ?? input.schedule,
    channels: channelsResult.data,
    project: scope.project,
  });
  if (!draftResult.success) {
    assertValidationErrors(draftResult);
  }

  const triggerOnce =
    input.trigger_once ?? (resolvedSchedule?.kind === "once" ? true : false);

  const rule = await createNotificationRule({
    userId: scope.userId,
    projectId: scope.projectId,
    installationId: scope.installationId,
    source: options.source ?? input.source ?? "user",
    sessionId: options.sessionId ?? input.session_id ?? null,
    label: input.label ?? null,
    notificationType,
    triggerKind: typeDefinition.trigger_kind,
    condition: input.condition ?? {},
    ...(resolvedSchedule != null ? { schedule: resolvedSchedule } : {}),
    channels: channelsResult.data,
    cooldownSeconds: input.cooldown_seconds,
    triggerOnce,
    expiresAt: parseExpiresAt(input.expires_at),
  });

  if (typeDefinition.trigger_kind === "schedule" && resolvedSchedule) {
    await enqueueNotificationScheduleOnce(rule.id, resolvedSchedule);
  }

  return toRuleRecord(rule);
}

export async function listNotificationRulesForUser(
  privyUserId: string,
  input: ListNotificationRulesInput = {},
): Promise<{ rules: NotificationRuleRecord[]; total: number; limit: number; offset: number }> {
  const scope = await resolveNotificationScope(privyUserId, {
    projectId: input.project_id,
    installationId: input.installation_id,
  });

  const limit = Math.min(input.limit ?? 50, 200);
  const offset = input.offset ?? 0;

  const { rules, total } = await listNotificationRules({
    userId: scope.userId,
    projectId: input.project_id,
    installationId: input.installation_id,
    status: input.status,
    notificationType: input.notification_type,
    limit,
    offset,
  });

  return {
    rules: rules.map(toRuleRecord),
    total,
    limit,
    offset,
  };
}

export async function getNotificationRuleForUser(
  privyUserId: string,
  ruleId: string,
): Promise<NotificationRuleRecord> {
  const scope = await resolveNotificationScope(privyUserId, {});
  const rule = await findNotificationRuleForUser(ruleId, scope.userId);
  if (!rule) {
    throw new AppError(404, "NOTIFICATION_RULE_NOT_FOUND", "Notification rule not found");
  }
  return toRuleRecord(rule);
}

export async function updateNotificationRuleForUser(
  privyUserId: string,
  ruleId: string,
  input: UpdateNotificationRuleInput,
): Promise<NotificationRuleRecord> {
  const scope = await resolveNotificationScope(privyUserId, {});
  const existing = await findNotificationRuleForUser(ruleId, scope.userId);
  if (!existing) {
    throw new AppError(404, "NOTIFICATION_RULE_NOT_FOUND", "Notification rule not found");
  }

  let project = null as { id: string; notification_schema?: unknown | null } | null;
  if (existing.project_id) {
    const { findProjectByIdForUser } = await import("../projects/project.repository.js");
    project = await findProjectByIdForUser(existing.project_id, scope.userId);
  }

  const typeDefinition = resolveNotificationTypeDefinition({
    notification_type: existing.notification_type,
    project,
  });
  if (!typeDefinition) {
    throw new AppError(404, "UNKNOWN_NOTIFICATION_TYPE", "Notification type no longer defined");
  }

  const nextCondition =
    input.condition !== undefined
      ? input.condition
      : (existing.condition as Record<string, unknown>);

  let resolvedScheduleUpdate: NotificationSchedule | null | undefined;
  if (input.schedule !== undefined) {
    if (input.schedule === null) {
      resolvedScheduleUpdate = null;
    } else {
      const scheduleResult = validateNotificationSchedule(input.schedule);
      if (!scheduleResult.success) {
        assertValidationErrors(scheduleResult);
      }
      resolvedScheduleUpdate = scheduleResult.data;
    }
  }

  const nextSchedule =
    resolvedScheduleUpdate !== undefined
      ? resolvedScheduleUpdate
      : (existing.schedule as NotificationSchedule | null);
  const nextChannels =
    input.channels !== undefined
      ? mergeRuleChannels(input.channels, typeDefinition)
      : (existing.channels as NotificationChannel[]);

  if (input.channels !== undefined) {
    const channelsResult = validateNotificationChannels(nextChannels);
    if (!channelsResult.success) {
      assertValidationErrors(channelsResult);
    }
  }

  if (input.condition !== undefined || input.schedule !== undefined || input.channels !== undefined) {
    const draftResult = validateNotificationRuleDraft({
      notification_type: existing.notification_type,
      trigger_kind: typeDefinition.trigger_kind,
      condition: nextCondition,
      schedule: nextSchedule ?? undefined,
      channels: nextChannels,
      project,
    });
    if (!draftResult.success) {
      assertValidationErrors(draftResult);
    }
  }

  if (input.status === "active" || input.status === "paused") {
    // allowed
  } else if (input.status !== undefined) {
    throw new AppError(400, "INVALID_STATUS", "Only active or paused status can be set via update");
  }

  const updated = await updateNotificationRule(ruleId, scope.userId, {
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.condition !== undefined ? { condition: input.condition } : {}),
    ...(resolvedScheduleUpdate !== undefined ? { schedule: resolvedScheduleUpdate } : {}),
    ...(input.channels !== undefined ? { channels: input.channels } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.cooldown_seconds !== undefined ? { cooldownSeconds: input.cooldown_seconds } : {}),
    ...(input.trigger_once !== undefined ? { triggerOnce: input.trigger_once } : {}),
    ...(input.expires_at !== undefined
      ? { expiresAt: input.expires_at ? parseExpiresAt(input.expires_at) : null }
      : {}),
  });

  if (!updated) {
    throw new AppError(404, "NOTIFICATION_RULE_NOT_FOUND", "Notification rule not found");
  }

  return toRuleRecord(updated);
}

export async function deleteNotificationRuleForUser(
  privyUserId: string,
  ruleId: string,
): Promise<{ id: string; status: "deleted" }> {
  const scope = await resolveNotificationScope(privyUserId, {});
  const deleted = await softDeleteNotificationRule(ruleId, scope.userId);
  if (!deleted) {
    throw new AppError(404, "NOTIFICATION_RULE_NOT_FOUND", "Notification rule not found");
  }
  return { id: deleted.id, status: "deleted" };
}

export async function getProjectNotificationSchemaForUser(
  privyUserId: string,
  projectId: string,
): Promise<ProjectNotificationSchema | null> {
  const scope = await resolveNotificationScope(privyUserId, { projectId });
  if (!scope.project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }
  return buildProjectNotificationSchema(scope.project);
}
