import type { Prisma, Project, ProjectStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export async function createProject(data: {
  userId: bigint;
  sessionId?: string;
  name: string;
  tagline?: string;
  template: string;
  accent?: string;
  templateParams?: Prisma.InputJsonValue;
  category?: string;
}): Promise<Project> {
  return prisma.project.create({
    data: {
      user_id: data.userId,
      session_id: data.sessionId,
      name: data.name,
      tagline: data.tagline ?? "",
      template: data.template,
      accent: data.accent ?? "#8e5bff",
      template_params: data.templateParams ?? {},
      category: data.category ?? "payments",
      status: "draft",
    },
  });
}

export async function findProjectByIdForUser(
  projectId: string,
  userId: bigint,
): Promise<Project | null> {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      user_id: userId,
    },
  });
}

export async function listProjectsByUserId(userId: bigint): Promise<Project[]> {
  return prisma.project.findMany({
    where: { user_id: userId },
    orderBy: { updated_at: "desc" },
  });
}

export async function updateProject(
  projectId: string,
  data: Prisma.ProjectUpdateInput,
): Promise<Project> {
  return prisma.project.update({
    where: { id: projectId },
    data,
  });
}

export async function bumpArtifactRevision(projectId: string): Promise<Project> {
  return prisma.project.update({
    where: { id: projectId },
    data: {
      artifact_revision: { increment: 1 },
      status: "draft",
    },
  });
}

export async function setProjectStatus(projectId: string, status: ProjectStatus): Promise<Project> {
  return prisma.project.update({
    where: { id: projectId },
    data: { status },
  });
}
