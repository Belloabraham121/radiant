import type { Project } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import { listArtifactFiles } from "./artifact.repository.js";
import { findProjectByIdForUser } from "./project.repository.js";
import {
  buildProjectActionsCatalogResponse,
  inferProjectActionSchemaForArtifact,
  type ProjectActionSchemaSource,
} from "./app-action-schema.service.js";
import type { PinnedAppScope } from "./pinned-app-scope.types.js";
import { coerceAppTemplate } from "./project.types.js";
import {
  findSessionDraftBySessionId,
  listSessionDraftFiles,
} from "./session-draft.repository.js";

function artifactFilesToInput(files: Array<{ path: string; content: string }>) {
  return files.map((file) => ({
    path: file.path.replace(/^\/workspace\//, ""),
    content: file.content,
  }));
}

/** Per-project action schema for GET .../actions (Phase 6). */
export function listAppActionsCatalogForProject(project: Project) {
  return buildProjectActionsCatalogResponse(project);
}

async function listAppActionsCatalogForProjectWithArtifacts(project: Project) {
  const revision = project.artifact_revision;
  const files =
    revision >= 0 ? await listArtifactFiles(project.id, revision) : [];
  return buildProjectActionsCatalogResponse(project, {
    files: artifactFilesToInput(files),
  });
}

/** Action schema for an installed app (installer's copy). */
export async function listAppActionsCatalogForInstallation(
  privyUserId: string,
  installationId: string,
) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const installation = await findInstallationForUser(installationId, user.id);
  if (!installation) {
    throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
  }

  const source = installation.source_project;
  const revision = installation.pinned_revision ?? source.artifact_revision;
  const files =
    revision >= 0 ? await listArtifactFiles(source.id, revision) : [];

  return buildProjectActionsCatalogResponse(source, {
    files: artifactFilesToInput(files),
  });
}

/** Resolve action catalog from chat-pinned app scope (avoids ambiguous session project list). */
export async function listAppActionsCatalogForPinnedScope(
  privyUserId: string,
  pinned: PinnedAppScope,
  sessionId?: string,
) {
  if (pinned.kind === "installation") {
    return listAppActionsCatalogForInstallation(privyUserId, pinned.installation_id);
  }

  if (pinned.kind === "project") {
    const user = await findUserByPrivyId(privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const project = await findProjectByIdForUser(pinned.project_id, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    return listAppActionsCatalogForProjectWithArtifacts(project);
  }

  if (!sessionId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "session_actions requires an active chat session.",
    );
  }

  return listAppActionsCatalogForSession(privyUserId, sessionId);
}

async function sessionDraftSchemaSource(
  privyUserId: string,
  sessionId: string,
): Promise<ProjectActionSchemaSource> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const session = await findSessionForUser(sessionId, user.id);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found");
  }

  const draft = await findSessionDraftBySessionId(sessionId);
  if (!draft) {
    return { id: sessionId, template: "custom", action_schema: null };
  }

  const files = await listSessionDraftFiles(draft.id, draft.revision);
  const template = coerceAppTemplate(draft.template);
  const actionSchema = inferProjectActionSchemaForArtifact(sessionId, {
    template,
    files: files.map((file) => ({
      path: file.path.replace(/^\/workspace\//, ""),
      content: file.content,
    })),
  });

  return {
    id: sessionId,
    template,
    action_schema: actionSchema,
  };
}

/** Action schema for unsaved chat draft preview (session-scoped APIs). */
export async function listAppActionsCatalogForSession(
  privyUserId: string,
  sessionId: string,
) {
  const source = await sessionDraftSchemaSource(privyUserId, sessionId);
  return buildProjectActionsCatalogResponse(source);
}
