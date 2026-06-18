import type { NotificationRule } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { getOrCreateNotificationPreference } from "./notification-preference.repository.js";
import { resolveNotificationTypeDefinition } from "./notification-schema.service.js";
import type { ScheduleRuleEvaluationContext } from "./notification-schedule.types.js";

export async function loadActiveScheduleRuleContexts(): Promise<ScheduleRuleEvaluationContext[]> {
  const now = new Date();

  const rules = await prisma.notificationRule.findMany({
    where: {
      status: "active",
      trigger_kind: "schedule",
      schedule: { not: Prisma.DbNull },
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    orderBy: { created_at: "asc" },
  });

  if (rules.length === 0) {
    return [];
  }

  const projectIds = new Set<string>();
  const installationIds = new Set<string>();
  const userIds = new Set<bigint>();

  for (const rule of rules) {
    userIds.add(rule.user_id);
    if (rule.project_id) {
      projectIds.add(rule.project_id);
    }
    if (rule.installation_id) {
      installationIds.add(rule.installation_id);
    }
  }

  const [projects, installations, preferences] = await Promise.all([
    projectIds.size > 0
      ? prisma.project.findMany({
          where: { id: { in: [...projectIds] } },
          select: { id: true, notification_schema: true },
        })
      : Promise.resolve([]),
    installationIds.size > 0
      ? prisma.appInstallation.findMany({
          where: { id: { in: [...installationIds] } },
          select: { id: true, source_project_id: true },
        })
      : Promise.resolve([]),
    Promise.all([...userIds].map((userId) => getOrCreateNotificationPreference(userId))),
  ]);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const installationProjectById = new Map(
    installations.map((installation) => [installation.id, installation.source_project_id]),
  );
  const timezoneByUserId = new Map(preferences.map((pref) => [pref.user_id, pref.timezone]));

  const missingProjectIds = new Set<string>();
  for (const installation of installations) {
    if (!projectById.has(installation.source_project_id)) {
      missingProjectIds.add(installation.source_project_id);
    }
  }

  if (missingProjectIds.size > 0) {
    const extraProjects = await prisma.project.findMany({
      where: { id: { in: [...missingProjectIds] } },
      select: { id: true, notification_schema: true },
    });
    for (const project of extraProjects) {
      projectById.set(project.id, project);
    }
  }

  const contexts: ScheduleRuleEvaluationContext[] = [];

  for (const rule of rules) {
    const context = buildScheduleRuleContext(
      rule,
      projectById,
      installationProjectById,
      timezoneByUserId.get(rule.user_id) ?? "UTC",
    );
    if (context) {
      contexts.push(context);
    }
  }

  return contexts;
}

function buildScheduleRuleContext(
  rule: NotificationRule,
  projectById: Map<string, { id: string; notification_schema: unknown }>,
  installationProjectById: Map<string, string>,
  preferenceTimezone: string,
): ScheduleRuleEvaluationContext | null {
  const projectId =
    rule.project_id ??
    (rule.installation_id ? (installationProjectById.get(rule.installation_id) ?? null) : null);

  const project = projectId ? (projectById.get(projectId) ?? null) : null;
  const typeDefinition = resolveNotificationTypeDefinition({
    notification_type: rule.notification_type,
    project,
  });

  if (!typeDefinition || typeDefinition.trigger_kind !== "schedule") {
    return null;
  }

  return {
    rule,
    typeDefinition,
    timezone: preferenceTimezone,
    projectId: rule.project_id ?? projectId,
    installationId: rule.installation_id,
  };
}
