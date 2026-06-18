import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import { validateArtifactBatch } from "../sandbox/sandbox-paths.js";
import { ensureAppEntry } from "./ensure-app-entry.js";
import { PREVIEW_PROJECT_ID } from "./preview-project.js";
import type { ArtifactPayload, GenerateAppResult } from "./project.types.js";
import {
  bumpSessionDraftRevision,
  findSessionDraftBySessionId,
  listSessionDraftFiles,
  upsertSessionDraftFiles,
} from "./session-draft.repository.js";
import {
  bumpArtifactRevision,
  findProjectByIdForUser,
  setProjectActionSchema,
  setProjectStatus,
} from "./project.repository.js";
import { listArtifactFiles } from "./artifact.repository.js";
import { upsertArtifactFiles } from "./artifact.repository.js";
import { inferProjectActionSchemaForArtifact } from "./app-action-schema.service.js";
import type { ProjectActionSchema } from "./app-action-schema.types.js";
import { Prisma } from "@prisma/client";
import { normalizeArtifactFileContent } from "./artifact-file-content.js";
import { resolveEditOldString } from "./edit-app-match.js";

export type EditAppEdit = {
  path: string;
  old_string?: string;
  new_string: string;
  /** When true, replace the entire file with new_string (old_string ignored). */
  replace_file?: boolean;
};

export type EditAppInput = {
  edits: EditAppEdit[];
  project_id?: string | null;
};

export type EditAppContext = {
  sessionId?: string;
};

function actionSchemaToPrismaJson(schema: ProjectActionSchema): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(schema)) as Prisma.InputJsonValue;
}

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
  allFiles: Array<{ path: string; content: string }>,
  editedPaths: string[],
  savedToProject: boolean,
  draftId?: string,
): GenerateAppResult {
  const artifact = buildArtifactPayload(projectId, meta, allFiles);
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

function applyEdits(
  files: Array<{ path: string; content: string }>,
  edits: EditAppEdit[],
): { editedFiles: Array<{ path: string; content: string }>; editedPaths: string[] } {
  const fileMap = new Map(files.map((f) => [toClientPath(f.path), f]));
  const editedPathSet = new Set<string>();

  for (const edit of edits) {
    const normalizedPath = toClientPath(edit.path);
    const file = fileMap.get(normalizedPath);

    if (!file) {
      throw new AppError(
        400,
        "EDIT_FILE_NOT_FOUND",
        `File "${normalizedPath}" does not exist in the current artifact. Available files: ${[...fileMap.keys()].join(", ")}`,
      );
    }

    if (edit.replace_file) {
      file.content = edit.new_string;
      editedPathSet.add(normalizedPath);
      continue;
    }

    const oldString = edit.old_string;
    if (!oldString?.trim()) {
      throw new AppError(
        400,
        "EDIT_OLD_STRING_REQUIRED",
        `Edit for "${normalizedPath}" requires old_string unless replace_file is true.`,
      );
    }

    const matchedOldString = resolveEditOldString(file.content, oldString);

    if (!matchedOldString) {
      // Strip platform CSS from error content so the agent sees clean user code
      let errorContent = file.content;
      if (normalizedPath.endsWith("globals.css")) {
        const platformIdx = errorContent.indexOf(".radiant-agent-indicator");
        if (platformIdx > 0) {
          errorContent = errorContent.slice(0, platformIdx).trimEnd()
            + "\n\n/* ... platform styles omitted ... */";
        }
      }
      const fullContent = errorContent.length <= 6000
        ? errorContent
        : errorContent.slice(0, 6000) + "\n... (truncated)";

      throw new AppError(
        400,
        "EDIT_STRING_NOT_FOUND",
        `Could not find the string to replace in "${normalizedPath}". ` +
          `The old_string was not found. ` +
          `IMPORTANT: You MUST immediately retry this edit — copy the EXACT text from the file content below as old_string. ` +
          `Do NOT tell the user it failed; just retry silently. ` +
          `replace_file is LAST RESORT only for full restructures, not small changes:\n\n${fullContent}`,
      );
    }

    const occurrences = file.content.split(matchedOldString).length - 1;
    if (occurrences > 1) {
      throw new AppError(
        400,
        "EDIT_AMBIGUOUS",
        `The old_string appears ${occurrences} times in "${normalizedPath}". Provide more surrounding context to make it unique.`,
      );
    }

    file.content = file.content.replace(matchedOldString, edit.new_string);
    editedPathSet.add(normalizedPath);
  }

  return {
    editedFiles: [...fileMap.values()].map((f) => ({
      path: toClientPath(f.path),
      content: normalizeArtifactFileContent(f.content),
    })),
    editedPaths: [...editedPathSet],
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

export async function editAppForUser(
  privyUserId: string,
  input: EditAppInput,
  context: EditAppContext = {},
): Promise<GenerateAppResult> {
  if (input.project_id) {
    return editProject(privyUserId, input, context);
  }

  if (!context.sessionId) {
    throw new AppError(
      400,
      "SESSION_REQUIRED",
      "Chat session is required to edit a preview artifact.",
    );
  }

  return editSessionDraft(privyUserId, context.sessionId, input);
}

async function editSessionDraft(
  privyUserId: string,
  sessionId: string,
  input: EditAppInput,
): Promise<GenerateAppResult> {
  await assertSessionAccess(privyUserId, sessionId);

  const draft = await findSessionDraftBySessionId(sessionId);
  if (!draft) {
    throw new AppError(
      404,
      "DRAFT_NOT_FOUND",
      "No artifact exists in this session to edit. Use generate_app to create one first.",
    );
  }

  const existingFiles = await listSessionDraftFiles(draft.id, draft.revision);
  if (existingFiles.length === 0) {
    throw new AppError(
      404,
      "DRAFT_EMPTY",
      "The current artifact has no files. Use generate_app to create one first.",
    );
  }

  const clientFiles = existingFiles.map((f) => ({
    path: toClientPath(f.path),
    content: f.content,
  }));

  const { editedFiles, editedPaths } = applyEdits(clientFiles, input.edits);

  const normalizedFiles = validateArtifactBatch(
    ensureAppEntry(editedFiles, { template: draft.template }),
  );

  const updatedDraft = await bumpSessionDraftRevision(draft.id);
  await upsertSessionDraftFiles(updatedDraft.id, updatedDraft.revision, normalizedFiles);

  return buildResult(
    PREVIEW_PROJECT_ID,
    {
      name: updatedDraft.name,
      tagline: updatedDraft.tagline,
      template: updatedDraft.template,
      revision: updatedDraft.revision,
    },
    normalizedFiles,
    editedPaths,
    false,
    updatedDraft.id,
  );
}

async function editProject(
  privyUserId: string,
  input: EditAppInput,
  context: EditAppContext,
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

  const project = input.project_id
    ? await findProjectByIdForUser(input.project_id, user.id)
    : null;

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  const existingFiles = await listArtifactFiles(project.id, project.artifact_revision);
  if (existingFiles.length === 0) {
    throw new AppError(
      404,
      "PROJECT_EMPTY",
      "This project has no artifact files. Use generate_app to create them first.",
    );
  }

  const clientFiles = existingFiles.map((f) => ({
    path: toClientPath(f.path),
    content: f.content,
  }));

  const { editedFiles, editedPaths } = applyEdits(clientFiles, input.edits);

  const normalizedFiles = validateArtifactBatch(
    ensureAppEntry(editedFiles, { template: project.template }),
  );

  const artifactFilesForSchema = normalizedFiles.map((file) => ({
    path: file.path.replace(/^\/workspace\//, ""),
    content: file.content,
  }));

  const actionSchema = inferProjectActionSchemaForArtifact(project.id, {
    template: project.template,
    files: artifactFilesForSchema,
  });

  await setProjectActionSchema(
    project.id,
    actionSchema ? actionSchemaToPrismaJson(actionSchema) : Prisma.DbNull,
  );

  const updated = await bumpArtifactRevision(project.id);
  const revision = updated.artifact_revision;
  await upsertArtifactFiles(project.id, revision, normalizedFiles);
  await setProjectStatus(project.id, "live");

  return buildResult(
    project.id,
    {
      name: project.name,
      tagline: project.tagline,
      template: project.template,
      revision,
    },
    normalizedFiles,
    editedPaths,
    true,
  );
}
