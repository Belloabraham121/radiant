import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";
import { findProjectByIdForUser } from "../projects/project.repository.js";
import type { ProjectNotificationSchemaSource } from "./notification-schema.service.js";

export type NotificationScope = {
  userId: bigint;
  projectId: string | null;
  installationId: string | null;
  project: ProjectNotificationSchemaSource | null;
};

export async function resolveNotificationScope(
  privyUserId: string,
  params: { projectId?: string; installationId?: string },
): Promise<NotificationScope> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  if (params.projectId && params.installationId) {
    throw new AppError(
      400,
      "INVALID_SCOPE",
      "Provide at most one of project_id or installation_id",
    );
  }

  if (params.installationId) {
    const installation = await findInstallationForUser(params.installationId, user.id);
    if (!installation) {
      throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
    }
    return {
      userId: user.id,
      projectId: installation.source_project.id,
      installationId: installation.id,
      project: installation.source_project,
    };
  }

  if (params.projectId) {
    const project = await findProjectByIdForUser(params.projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    return {
      userId: user.id,
      projectId: project.id,
      installationId: null,
      project,
    };
  }

  return {
    userId: user.id,
    projectId: null,
    installationId: null,
    project: null,
  };
}
