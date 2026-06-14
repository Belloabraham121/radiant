import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import { validateArtifactBatch } from "../sandbox/sandbox-paths.js";
import { upsertArtifactFiles } from "./artifact.repository.js";
import {
  bumpArtifactRevision,
  createProject,
  findProjectByIdForUser,
  updateProject,
} from "./project.repository.js";
import type { GenerateAppInput, GenerateAppResult } from "./project.types.js";
import { ensureAppEntry } from "./ensure-app-entry.js";

export type GenerateAppContext = {
  sessionId?: string;
};

export async function generateAppForUser(
  privyUserId: string,
  input: GenerateAppInput,
  context: GenerateAppContext = {},
): Promise<GenerateAppResult> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  if (context.sessionId) {
    const session = await findSessionForUser(context.sessionId, user.id);
    if (!session) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found");
    }
  }

  const normalizedFiles = validateArtifactBatch(ensureAppEntry(input.files));

  let project =
    input.project_id
      ? await findProjectByIdForUser(input.project_id, user.id)
      : null;

  if (input.project_id && !project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  if (!project) {
    project = await createProject({
      userId: user.id,
      sessionId: context.sessionId,
      name: input.name,
      tagline: input.tagline,
      template: input.template,
    });
  } else {
    project = await updateProject(project.id, {
      name: input.name,
      tagline: input.tagline ?? project.tagline,
      template: input.template,
      ...(context.sessionId
        ? { session: { connect: { id: context.sessionId } } }
        : {}),
    });
    project = await bumpArtifactRevision(project.id);
  }

  const revision = project.artifact_revision;
  await upsertArtifactFiles(project.id, revision, normalizedFiles);

  const clientFiles = normalizedFiles.map((file) => ({
    path: file.path.replace(/^\/workspace\//, ""),
    content: file.content,
  }));

  const artifact = {
    project_id: project.id,
    name: project.name,
    tagline: project.tagline,
    template: project.template,
    revision,
    files: clientFiles,
  };

  return {
    project_id: project.id,
    name: project.name,
    tagline: project.tagline,
    template: project.template,
    revision,
    files: clientFiles,
    artifact,
  };
}
