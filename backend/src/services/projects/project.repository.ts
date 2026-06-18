import { Prisma } from "@prisma/client";
import type { Project, ProjectStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!UUID_RE.test(projectId.trim())) {
    return null;
  }
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

export type ListProjectsOptions = {
  page: number;
  limit: number;
  search?: string;
  scope?: "all" | "saved" | "deployed";
  sessionId?: string;
};

export async function listProjectsForUserPaginated(
  userId: bigint,
  options: ListProjectsOptions,
): Promise<{ projects: Project[]; total: number }> {
  const where: Prisma.ProjectWhereInput = {
    user_id: userId,
    ...(options.sessionId ? { session_id: options.sessionId } : {}),
    ...(options.scope === "saved" ? { walrus_url: null } : {}),
    ...(options.scope === "deployed" ? { walrus_url: { not: null } } : {}),
    ...(options.search?.trim()
      ? {
          OR: [
            { name: { contains: options.search.trim(), mode: "insensitive" } },
            { tagline: { contains: options.search.trim(), mode: "insensitive" } },
            { template: { contains: options.search.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const skip = (options.page - 1) * options.limit;

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip,
      take: options.limit,
    }),
    prisma.project.count({ where }),
  ]);

  return { projects, total };
}

export async function deleteProjectForUser(projectId: string, userId: bigint): Promise<void> {
  const project = await findProjectByIdForUser(projectId, userId);
  if (!project) {
    return;
  }

  await prisma.project.delete({
    where: { id: projectId },
  });
}

export async function listProjectsBySessionForUser(
  userId: bigint,
  sessionId: string,
): Promise<Project[]> {
  return prisma.project.findMany({
    where: {
      user_id: userId,
      session_id: sessionId,
    },
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

/** Persist or clear the per-project app action schema (JSONB). */
export async function setProjectActionSchema(
  projectId: string,
  actionSchema: Prisma.InputJsonValue | typeof Prisma.DbNull,
): Promise<Project> {
  return prisma.project.update({
    where: { id: projectId },
    data: { action_schema: actionSchema } as Prisma.ProjectUpdateInput,
  });
}
