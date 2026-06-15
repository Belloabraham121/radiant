import type { Project } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import {
  buildProjectActionsCatalogResponse,
  inferProjectActionSchemaForArtifact,
  type ProjectActionSchemaSource,
} from "./app-action-schema.service.js";
import { coerceAppTemplate } from "./project.types.js";
import {
  findSessionDraftBySessionId,
  listSessionDraftFiles,
} from "./session-draft.repository.js";

/** Per-project action schema for GET .../actions (Phase 6). */
export function listAppActionsCatalogForProject(project: Project) {
  return buildProjectActionsCatalogResponse(project);
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
