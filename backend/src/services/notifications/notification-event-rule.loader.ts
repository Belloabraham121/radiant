import type { NotificationRule } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { resolveNotificationTypeDefinition } from "./notification-schema.service.js";
import type { EventRuleEvaluationContext } from "./notification-event.types.js";

export type ListActiveEventRulesInput = {
  notificationType: string;
  projectId?: string | null;
  installationId?: string | null;
  userId?: bigint;
};

export async function listActiveEventRules(
  input: ListActiveEventRulesInput,
): Promise<NotificationRule[]> {
  const now = new Date();

  return prisma.notificationRule.findMany({
    where: {
      status: "active",
      trigger_kind: "event",
      notification_type: input.notificationType,
      ...(input.userId !== undefined ? { user_id: input.userId } : {}),
      ...(input.projectId ? { project_id: input.projectId } : {}),
      ...(input.installationId ? { installation_id: input.installationId } : {}),
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    orderBy: { created_at: "asc" },
  });
}

export async function loadEventRuleEvaluationContexts(
  input: ListActiveEventRulesInput,
): Promise<EventRuleEvaluationContext[]> {
  const rules = await listActiveEventRules(input);
  if (rules.length === 0) {
    return [];
  }

  const projectIds = new Set<string>();
  const installationIds = new Set<string>();

  for (const rule of rules) {
    if (rule.project_id) {
      projectIds.add(rule.project_id);
    }
    if (rule.installation_id) {
      installationIds.add(rule.installation_id);
    }
  }

  const [projects, installations] = await Promise.all([
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
  ]);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const installationProjectById = new Map(
    installations.map((installation) => [installation.id, installation.source_project_id]),
  );

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

  const contexts: EventRuleEvaluationContext[] = [];

  for (const rule of rules) {
    const projectId =
      rule.project_id ??
      (rule.installation_id ? (installationProjectById.get(rule.installation_id) ?? null) : null);
    const project = projectId ? (projectById.get(projectId) ?? null) : null;

    const typeDefinition = resolveNotificationTypeDefinition({
      notification_type: rule.notification_type,
      project,
    });

    if (!typeDefinition || typeDefinition.trigger_kind !== "event") {
      continue;
    }

    contexts.push({
      rule,
      typeDefinition,
      projectId: rule.project_id ?? projectId,
      installationId: rule.installation_id,
    });
  }

  return contexts;
}
