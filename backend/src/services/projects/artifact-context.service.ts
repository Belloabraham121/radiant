import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import {
  findSessionDraftBySessionId,
  listSessionDraftFiles,
} from "./session-draft.repository.js";
import { findProjectByIdForUser } from "./project.repository.js";
import { listArtifactFiles } from "./artifact.repository.js";
import type { PinnedAppScope } from "./pinned-app-scope.types.js";

const PLATFORM_FILES = new Set([
  "lib/radiant-client.ts",
  "lib/radiant-agent-runtime.ts",
  "components/AgentIndicator.tsx",
]);

const MAX_CONTEXT_CHARS = 24_000;
const MAX_FILE_CHARS = 4_000;

function toClientPath(path: string): string {
  return path.replace(/^\/workspace\//, "");
}

export type ArtifactSourceFile = {
  path: string;
  content: string;
};

export function pinnedScopeSupportsSourceEdits(scope: PinnedAppScope): boolean {
  return scope.kind === "project" || scope.kind === "session_draft";
}

export async function loadArtifactFilesForPinnedScope(
  privyUserId: string,
  sessionId: string,
  scope: PinnedAppScope,
): Promise<ArtifactSourceFile[] | null> {
  if (!pinnedScopeSupportsSourceEdits(scope)) {
    return null;
  }

  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return null;
  }

  if (scope.kind === "project") {
    const project = await findProjectByIdForUser(scope.project_id, user.id);
    if (!project || project.artifact_revision < 0) {
      return null;
    }
    const files = await listArtifactFiles(project.id, project.artifact_revision);
    if (files.length === 0) {
      return null;
    }
    return files.map((file) => ({
      path: toClientPath(file.path),
      content: file.content,
    }));
  }

  const session = await findSessionForUser(sessionId, user.id);
  if (!session) {
    return null;
  }

  const draft = await findSessionDraftBySessionId(sessionId);
  if (!draft) {
    return null;
  }

  const files = await listSessionDraftFiles(draft.id, draft.revision);
  if (files.length === 0) {
    return null;
  }

  return files.map((file) => ({
    path: toClientPath(file.path),
    content: file.content,
  }));
}

function truncateFileContent(path: string, content: string): string {
  if (content.length <= MAX_FILE_CHARS) {
    return content;
  }
  return (
    content.slice(0, MAX_FILE_CHARS) +
    `\n... (${content.length - MAX_FILE_CHARS} more chars truncated in ${path})`
  );
}

/** Compact source listing for the system prompt when the user pins an editable app. */
export function formatArtifactContextForPrompt(
  scope: PinnedAppScope,
  files: ArtifactSourceFile[],
): string {
  const userFiles = files.filter((file) => !PLATFORM_FILES.has(file.path));
  const lines: string[] = [
    `Pinned app source (${scope.name}) — ${userFiles.length} user file(s). ` +
      "Use this as the authoritative copy for surgical edits (old_string must match exactly). " +
      "Platform applies the pinned app target automatically — do not ask the user for ids.",
  ];

  let used = lines.join("\n").length;

  for (const file of userFiles.sort((a, b) => a.path.localeCompare(b.path))) {
    const body = truncateFileContent(file.path, file.content);
    const block = `--- ${file.path} ---\n${body}`;
    if (used + block.length + 2 > MAX_CONTEXT_CHARS) {
      lines.push(`... (${userFiles.length - lines.length + 1} more files omitted for context limit)`);
      break;
    }
    lines.push(block);
    used += block.length + 2;
  }

  return lines.join("\n\n");
}

export async function buildPinnedArtifactContextBlock(
  privyUserId: string,
  sessionId: string,
  scope: PinnedAppScope,
): Promise<string | undefined> {
  const files = await loadArtifactFilesForPinnedScope(privyUserId, sessionId, scope);
  if (!files?.length) {
    return undefined;
  }
  return formatArtifactContextForPrompt(scope, files);
}

export async function readArtifactForUser(
  privyUserId: string,
  sessionId: string | undefined,
  input: { project_id?: string | null; paths?: string[] },
): Promise<{ files: ArtifactSourceFile[]; name: string }> {
  if (input.project_id) {
    const user = await findUserByPrivyId(privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const project = await findProjectByIdForUser(input.project_id, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    const files = await listArtifactFiles(project.id, project.artifact_revision);
    const mapped = files.map((file) => ({
      path: toClientPath(file.path),
      content: file.content,
    }));
    return {
      name: project.name,
      files: filterPaths(mapped, input.paths),
    };
  }

  if (!sessionId) {
    throw new AppError(
      400,
      "SESSION_REQUIRED",
      "Chat session is required to read a preview artifact.",
    );
  }

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
    throw new AppError(
      404,
      "DRAFT_NOT_FOUND",
      "No artifact exists in this session.",
    );
  }

  const files = await listSessionDraftFiles(draft.id, draft.revision);
  const mapped = files.map((file) => ({
    path: toClientPath(file.path),
    content: file.content,
  }));

  return {
    name: draft.name,
    files: filterPaths(mapped, input.paths),
  };
}

function filterPaths(files: ArtifactSourceFile[], paths?: string[]): ArtifactSourceFile[] {
  if (!paths?.length) {
    return files.filter((file) => !PLATFORM_FILES.has(file.path));
  }
  const wanted = new Set(paths.map((path) => toClientPath(path)));
  return files.filter((file) => wanted.has(file.path));
}

/** Merge incoming generate_app files onto a previous revision (preserve untouched paths). */
export function mergeArtifactFileSets(
  existing: ArtifactSourceFile[],
  incoming: ArtifactSourceFile[],
): ArtifactSourceFile[] {
  const map = new Map(existing.map((file) => [toClientPath(file.path), file.content]));
  for (const file of incoming) {
    map.set(toClientPath(file.path), file.content);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({ path, content }));
}
