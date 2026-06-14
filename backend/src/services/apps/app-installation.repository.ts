import type { AppInstallation, Project } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export type InstallationWithSource = AppInstallation & {
  source_project: Project;
};

export async function findInstallationForUser(
  installationId: string,
  userId: bigint,
): Promise<InstallationWithSource | null> {
  return prisma.appInstallation.findFirst({
    where: { id: installationId, user_id: userId },
    include: { source_project: true },
  });
}

export async function findInstallationByUserAndProject(
  userId: bigint,
  sourceProjectId: string,
): Promise<AppInstallation | null> {
  return prisma.appInstallation.findUnique({
    where: {
      user_id_source_project_id: {
        user_id: userId,
        source_project_id: sourceProjectId,
      },
    },
  });
}

export async function createInstallation(data: {
  userId: bigint;
  sourceProjectId: string;
  pinnedRevision: number;
}): Promise<AppInstallation> {
  return prisma.appInstallation.create({
    data: {
      user_id: data.userId,
      source_project_id: data.sourceProjectId,
      pinned_revision: data.pinnedRevision,
    },
  });
}

export async function listInstallationsByUserId(userId: bigint): Promise<InstallationWithSource[]> {
  return prisma.appInstallation.findMany({
    where: { user_id: userId },
    include: { source_project: true },
    orderBy: { installed_at: "desc" },
  });
}

export async function countInstallationsForProject(sourceProjectId: string): Promise<number> {
  return prisma.appInstallation.count({
    where: { source_project_id: sourceProjectId },
  });
}
