import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import { validateArtifactBatch } from "../sandbox/sandbox-paths.js";
import { upsertArtifactFiles } from "./artifact.repository.js";
import { ensureAppEntry } from "./ensure-app-entry.js";
import { PREVIEW_PROJECT_ID } from "./preview-project.js";
import { Prisma } from "@prisma/client";
import type { ArtifactPayload, GenerateAppInput, GenerateAppResult } from "./project.types.js";
import { coerceAppTemplate } from "./project.types.js";
import {
  bumpSessionDraftRevision,
  createSessionDraft,
  findSessionDraftBySessionId,
  listSessionDraftFiles,
  updateSessionDraftMeta,
  upsertSessionDraftFiles,
} from "./session-draft.repository.js";
import {
  bumpArtifactRevision,
  createProject,
  findProjectByIdForUser,
  setProjectActionSchema,
  setProjectStatus,
  updateProject,
} from "./project.repository.js";
import { inferProjectActionSchemaForArtifact } from "./app-action-schema.service.js";
import type { ProjectActionSchema } from "./app-action-schema.types.js";

function actionSchemaToPrismaJson(schema: ProjectActionSchema): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(schema)) as Prisma.InputJsonValue;
}

export type GenerateAppContext = {
  sessionId?: string;
};

function toClientPath(path: string): string {
  return path.replace(/^\/workspace\//, "");
}

function toClientFiles(files: Array<{ path: string; content: string }>) {
  return files.map((file) => ({
    path: toClientPath(file.path),
    content: file.content,
  }));
}

function buildArtifactPayload(
  projectId: string,
  meta: { name: string; tagline: string; template: string; revision: number },
  files: Array<{ path: string; content: string }>,
): ArtifactPayload {
  return {
    project_id: projectId,
    name: meta.name,
    tagline: meta.tagline,
    template: meta.template,
    revision: meta.revision,
    files: toClientFiles(files),
  };
}

function buildResult(
  projectId: string,
  meta: { name: string; tagline: string; template: string; revision: number },
  clientFiles: Array<{ path: string; content: string }>,
  savedToProject: boolean,
  draftId?: string,
): GenerateAppResult {
  const artifact = buildArtifactPayload(projectId, meta, clientFiles);
  return {
    project_id: projectId,
    name: meta.name,
    tagline: meta.tagline,
    template: meta.template,
    revision: meta.revision,
    files: artifact.files,
    artifact,
    saved_to_project: savedToProject,
    ...(draftId ? { draft_id: draftId } : {}),
  };
}

async function assertSessionAccess(privyUserId: string, sessionId: string) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const session = await findSessionForUser(sessionId, user.id);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found");
  }
  return user;
}

async function persistSessionDraft(
  privyUserId: string,
  sessionId: string,
  input: GenerateAppInput,
): Promise<GenerateAppResult> {
  await assertSessionAccess(privyUserId, sessionId);

  const normalizedFiles = validateArtifactBatch(
    ensureAppEntry(input.files, { template: input.template }),
  );
  let draft = await findSessionDraftBySessionId(sessionId);

  if (!draft) {
    draft = await createSessionDraft({
      sessionId,
      name: input.name,
      tagline: input.tagline,
      template: input.template,
    });
  } else {
    draft = await updateSessionDraftMeta(draft.id, {
      name: input.name,
      tagline: input.tagline ?? draft.tagline,
      template: input.template,
    });
    draft = await bumpSessionDraftRevision(draft.id);
  }

  await upsertSessionDraftFiles(draft.id, draft.revision, normalizedFiles);

  const clientFiles = toClientFiles(normalizedFiles);
  return buildResult(
    PREVIEW_PROJECT_ID,
    {
      name: draft.name,
      tagline: draft.tagline,
      template: draft.template,
      revision: draft.revision,
    },
    clientFiles,
    false,
    draft.id,
  );
}

async function persistProject(
  privyUserId: string,
  input: GenerateAppInput,
  context: GenerateAppContext,
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

  const normalizedFiles = validateArtifactBatch(
    ensureAppEntry(input.files, { template: input.template }),
  );

  const artifactFilesForSchema = normalizedFiles.map((file) => ({
    path: file.path.replace(/^\/workspace\//, ""),
    content: file.content,
  }));

  let project =
    input.project_id ? await findProjectByIdForUser(input.project_id, user.id) : null;

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
    const actionSchema = inferProjectActionSchemaForArtifact(project.id, {
      template: input.template,
      files: artifactFilesForSchema,
    });
    if (actionSchema) {
      project = await setProjectActionSchema(
        project.id,
        actionSchemaToPrismaJson(actionSchema),
      );
    }
  } else {
    const actionSchema = inferProjectActionSchemaForArtifact(project.id, {
      template: input.template,
      files: artifactFilesForSchema,
    });
    project = await updateProject(project.id, {
      name: input.name,
      tagline: input.tagline ?? project.tagline,
      template: input.template,
      ...(context.sessionId
        ? { session: { connect: { id: context.sessionId } } }
        : {}),
    });
    project = await setProjectActionSchema(
      project.id,
      actionSchema ? actionSchemaToPrismaJson(actionSchema) : Prisma.DbNull,
    );
    project = await bumpArtifactRevision(project.id);
  }

  const revision = project.artifact_revision;
  await upsertArtifactFiles(project.id, revision, normalizedFiles);
  await setProjectStatus(project.id, "live");

  const clientFiles = toClientFiles(normalizedFiles);
  return buildResult(
    project.id,
    {
      name: project.name,
      tagline: project.tagline,
      template: project.template,
      revision,
    },
    clientFiles,
    true,
  );
}

export async function generateAppForUser(
  privyUserId: string,
  input: GenerateAppInput,
  context: GenerateAppContext = {},
): Promise<GenerateAppResult> {
  const shouldSaveProject = input.save_to_project === true || Boolean(input.project_id);

  if (shouldSaveProject) {
    return persistProject(privyUserId, input, context);
  }

  if (!context.sessionId) {
    throw new AppError(
      400,
      "SESSION_REQUIRED",
      "Chat session is required to build a preview artifact — save_to_project for a standalone project.",
    );
  }

  return persistSessionDraft(privyUserId, context.sessionId, input);
}

export async function saveSessionDraftToProjectForUser(
  privyUserId: string,
  sessionId: string,
  options: { name?: string; tagline?: string; project_id?: string } = {},
): Promise<GenerateAppResult> {
  await assertSessionAccess(privyUserId, sessionId);

  const draft = await findSessionDraftBySessionId(sessionId);
  if (!draft) {
    throw new AppError(404, "DRAFT_NOT_FOUND", "No chat draft to save in this session");
  }

  const files = await listSessionDraftFiles(draft.id, draft.revision);
  if (files.length === 0) {
    throw new AppError(404, "DRAFT_EMPTY", "Chat draft has no files to save");
  }

  return persistProject(
    privyUserId,
    {
      project_id: options.project_id,
      name: options.name ?? draft.name,
      tagline: options.tagline ?? draft.tagline,
      template: coerceAppTemplate(draft.template),
      save_to_project: true,
      files: files.map((file) => ({
        path: file.path.replace(/^\/workspace\//, ""),
        content: file.content,
      })),
    },
    { sessionId },
  );
}

export async function getSessionDraftSummaryForUser(
  privyUserId: string,
  sessionId: string,
): Promise<{ has_draft: boolean; name?: string; revision?: number }> {
  await assertSessionAccess(privyUserId, sessionId);
  const draft = await findSessionDraftBySessionId(sessionId);
  if (!draft) {
    return { has_draft: false };
  }
  return {
    has_draft: true,
    name: draft.name,
    revision: draft.revision,
  };
}
