import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { artifactRevisionExists, listArtifactFiles } from "../projects/artifact.repository.js";
import { findProjectByIdForUser, updateProject } from "../projects/project.repository.js";
import type { ArtifactPayload } from "../projects/project.types.js";
import { APP_CATEGORIES } from "./app-catalog.types.js";
import { getPublicApp } from "./app-catalog.service.js";
import {
  createInstallation,
  findInstallationByUserAndProject,
  findInstallationForUser,
  listInstallationsByUserId,
} from "./app-installation.repository.js";

const publishBodySchema = z.object({
  is_public: z.boolean(),
  fee_bps: z.number().int().min(0).max(1000).optional(),
  category: z.enum(APP_CATEGORIES).optional(),
  tagline: z.string().max(500).optional(),
});

function toClientPath(path: string): string {
  return path.replace(/^\/workspace\//, "");
}

function toArtifactPayload(
  project: {
    id: string;
    name: string;
    tagline: string;
    template: string;
    artifact_revision: number;
  },
  revision: number,
  files: Array<{ path: string; content: string }>,
): ArtifactPayload {
  return {
    project_id: project.id,
    name: project.name,
    tagline: project.tagline,
    template: project.template,
    revision,
    files: files.map((file) => ({
      path: toClientPath(file.path),
      content: file.content,
    })),
  };
}

export async function publishProjectForUser(
  privyUserId: string,
  projectId: string,
  body: unknown,
) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  const params = publishBodySchema.parse(body);

  if (params.is_public) {
    if (project.status !== "live") {
      throw new AppError(
        400,
        "PROJECT_NOT_READY",
        "Project must be live before publishing to the explorer",
      );
    }
    if (project.artifact_revision < 0) {
      throw new AppError(400, "ARTIFACT_MISSING", "Project has no saved artifact");
    }
    if (!(await artifactRevisionExists(projectId, project.artifact_revision))) {
      throw new AppError(404, "ARTIFACT_REVISION_NOT_FOUND", "Artifact revision not found");
    }
  }

  const updated = await updateProject(projectId, {
    is_public: params.is_public,
    ...(params.fee_bps !== undefined ? { fee_bps: params.fee_bps } : {}),
    ...(params.category !== undefined ? { category: params.category } : {}),
    ...(params.tagline !== undefined ? { tagline: params.tagline } : {}),
  });

  return {
    id: updated.id,
    is_public: updated.is_public,
    fee_bps: updated.fee_bps,
    category: updated.category,
    tagline: updated.tagline,
    status: updated.status,
  };
}

export async function getProjectPublishStateForUser(privyUserId: string, projectId: string) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return {
    id: project.id,
    is_public: project.is_public,
    fee_bps: project.fee_bps,
    category: project.category,
    tagline: project.tagline,
    status: project.status,
    can_publish: project.status === "live" && project.artifact_revision >= 0,
  };
}

export async function getInstallationArtifactPayload(
  privyUserId: string,
  installationId: string,
): Promise<{
  installation: {
    id: string;
    source_project_id: string;
    pinned_revision: number | null;
    installed_at: string;
  };
  artifact: ArtifactPayload;
}> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const installation = await findInstallationForUser(installationId, user.id);
  if (!installation) {
    throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
  }

  const source = installation.source_project;
  if (!source.is_public || source.status !== "live") {
    throw new AppError(410, "APP_UNAVAILABLE", "This app is no longer available in the explorer");
  }

  const revision = installation.pinned_revision ?? source.artifact_revision;
  if (revision < 0 || !(await artifactRevisionExists(source.id, revision))) {
    throw new AppError(404, "ARTIFACT_REVISION_NOT_FOUND", "Artifact revision not found");
  }

  const files = await listArtifactFiles(source.id, revision);
  return {
    installation: {
      id: installation.id,
      source_project_id: source.id,
      pinned_revision: installation.pinned_revision,
      installed_at: installation.installed_at.toISOString(),
    },
    artifact: toArtifactPayload(source, revision, files),
  };
}

export async function installPublicAppForUser(privyUserId: string, projectId: string) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const listing = await getPublicApp(projectId);

  const existing = await findInstallationByUserAndProject(user.id, projectId);
  if (existing) {
    return {
      installation_id: existing.id,
      already_installed: true,
      source_project_id: projectId,
      app_name: listing.name,
    };
  }

  const installation = await createInstallation({
    userId: user.id,
    sourceProjectId: projectId,
    pinnedRevision: listing.artifact_revision,
  });

  return {
    installation_id: installation.id,
    already_installed: false,
    source_project_id: projectId,
    app_name: listing.name,
  };
}

export async function listInstallationsForUser(privyUserId: string) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const rows = await listInstallationsByUserId(user.id);

  return {
    installations: rows.map((row) => ({
      id: row.id,
      source_project_id: row.source_project_id,
      name: row.source_project.name,
      tagline: row.source_project.tagline,
      accent: row.source_project.accent,
      category: row.source_project.category,
      pinned_revision: row.pinned_revision,
      installed_at: row.installed_at.toISOString(),
      available: row.source_project.is_public && row.source_project.status === "live",
    })),
  };
}
