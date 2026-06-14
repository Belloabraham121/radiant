import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import {
  artifactRevisionExists,
  listArtifactFiles,
  listArtifactRevisions,
  upsertArtifactFiles,
} from "./artifact.repository.js";
import {
  bumpArtifactRevision,
  findProjectByIdForUser,
  listProjectsBySessionForUser,
} from "./project.repository.js";
import type { ArtifactPayload } from "./project.types.js";

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

export async function getProjectArtifactPayloadForUser(
  privyUserId: string,
  projectId: string,
  revision?: number,
): Promise<ArtifactPayload> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  const targetRevision = revision ?? project.artifact_revision;
  if (targetRevision < 0) {
    throw new AppError(404, "ARTIFACT_REVISION_NOT_FOUND", "Artifact revision not found");
  }

  if (!(await artifactRevisionExists(projectId, targetRevision))) {
    throw new AppError(404, "ARTIFACT_REVISION_NOT_FOUND", "Artifact revision not found");
  }

  const files = await listArtifactFiles(projectId, targetRevision);
  return toArtifactPayload(project, targetRevision, files);
}

export async function listProjectRevisionsForUser(
  privyUserId: string,
  projectId: string,
) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  const revisions = await listArtifactRevisions(projectId);
  return {
    project_id: project.id,
    current_revision: project.artifact_revision,
    revisions,
  };
}

export async function restoreProjectRevisionForUser(
  privyUserId: string,
  projectId: string,
  sourceRevision: number,
): Promise<ArtifactPayload> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  if (sourceRevision === project.artifact_revision) {
    const files = await listArtifactFiles(projectId, sourceRevision);
    return toArtifactPayload(project, sourceRevision, files);
  }

  if (!(await artifactRevisionExists(projectId, sourceRevision))) {
    throw new AppError(404, "ARTIFACT_REVISION_NOT_FOUND", "Artifact revision not found");
  }

  const sourceFiles = await listArtifactFiles(projectId, sourceRevision);
  if (sourceFiles.length === 0) {
    throw new AppError(400, "ARTIFACT_EMPTY", "Revision has no files to restore");
  }

  const bumped = await bumpArtifactRevision(projectId);
  const newRevision = bumped.artifact_revision;

  await upsertArtifactFiles(
    projectId,
    newRevision,
    sourceFiles.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  );

  return toArtifactPayload(bumped, newRevision, sourceFiles);
}

export async function listSessionProjectsForUser(
  privyUserId: string,
  sessionId: string,
) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const session = await findSessionForUser(sessionId, user.id);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found");
  }

  const projects = await listProjectsBySessionForUser(user.id, sessionId);
  return projects.map((project) => ({
    project_id: project.id,
    name: project.name,
    tagline: project.tagline,
    template: project.template,
    status: project.status,
    artifact_revision: project.artifact_revision,
    updated_at: project.updated_at.toISOString(),
    created_at: project.created_at.toISOString(),
  }));
}
