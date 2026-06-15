import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { getSessionDraftSummaryForUser } from "./generate-app.service.js";
import { listSessionProjectsForUser } from "./project-artifact.service.js";
import { findProjectByIdForUser } from "./project.repository.js";

export type ResolvedAppScope =
  | { kind: "project"; project_id: string; name: string }
  | { kind: "session_draft"; session_id: string; name: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** When the LLM passes an app name as project_id, move it to app_name before Zod UUID validation. */
export function coerceMislabeledAppScopeFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...input };
  const projectId = next.project_id;
  if (typeof projectId === "string" && projectId.trim() && !isUuid(projectId)) {
    if (typeof next.app_name !== "string" || !next.app_name.trim()) {
      next.app_name = projectId.trim();
    }
    delete next.project_id;
  }
  return next;
}

export type AppScopeCandidate = {
  kind: "project" | "session_draft";
  name: string;
  tagline?: string;
  project_id?: string;
};

export function normalizeAppSearchTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/\b(app|ui|dex|interface)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Score how well a user hint matches a saved project or chat draft name. */
export function scoreAppNameMatch(hint: string, name: string, tagline?: string): number {
  const normalizedHint = normalizeAppSearchTerm(hint);
  const normalizedName = normalizeAppSearchTerm(name);
  const normalizedTagline = tagline ? normalizeAppSearchTerm(tagline) : "";

  if (!normalizedHint || !normalizedName) {
    return 0;
  }

  if (normalizedName === normalizedHint) {
    return 100;
  }
  if (normalizedName.includes(normalizedHint) || normalizedHint.includes(normalizedName)) {
    return 90;
  }
  if (normalizedTagline && (normalizedTagline.includes(normalizedHint) || normalizedHint.includes(normalizedTagline))) {
    return 85;
  }

  const hintTokens = normalizedHint.split(/\s+/).filter(Boolean);
  const nameTokens = new Set(
    [...normalizedName.split(/\s+/), ...normalizedTagline.split(/\s+/)]
      .map((token) => token.trim())
      .filter(Boolean),
  );

  const overlap = hintTokens.filter((token) => nameTokens.has(token)).length;
  return overlap * 15;
}

export async function listAppScopeCandidatesForSession(
  privyUserId: string,
  sessionId: string,
): Promise<AppScopeCandidate[]> {
  const [projects, draft] = await Promise.all([
    listSessionProjectsForUser(privyUserId, sessionId),
    getSessionDraftSummaryForUser(privyUserId, sessionId),
  ]);

  const candidates: AppScopeCandidate[] = projects.map((project) => ({
    kind: "project",
    name: project.name,
    tagline: project.tagline,
    project_id: project.project_id,
  }));

  if (draft.has_draft) {
    candidates.push({
      kind: "session_draft",
      name: draft.name ?? "Chat draft",
    });
  }

  return candidates;
}

function pickBestCandidate(
  candidates: AppScopeCandidate[],
  appName: string,
): AppScopeCandidate | null {
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreAppNameMatch(appName, candidate.name, candidate.tagline),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    return null;
  }

  const best = scored[0];
  const runnerUp = scored[1];
  if (runnerUp && runnerUp.score === best.score) {
    return null;
  }

  return best.score >= 15 ? best.candidate : null;
}

export type ResolveAppScopeInput = {
  project_id?: string;
  installation_id?: string;
  app_name?: string;
  use_session_draft?: boolean;
};

/**
 * Resolve which app (saved project or chat draft) an agent action should target.
 * Never treat app names as UUIDs — match by name within the current chat session.
 */
export async function resolveAppScope(
  privyUserId: string,
  sessionId: string | undefined,
  input: ResolveAppScopeInput,
): Promise<ResolvedAppScope> {
  if (input.installation_id) {
    throw new AppError(
      400,
      "INSTALLATION_SCOPE_UNSUPPORTED",
      "Installation scope is resolved via installation_id in call_app_action — use installation_id directly.",
    );
  }

  if (input.project_id) {
    const user = await findUserByPrivyId(privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const project = await findProjectByIdForUser(input.project_id, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    return { kind: "project", project_id: project.id, name: project.name };
  }

  if (!sessionId) {
    throw new AppError(
      400,
      "APP_SCOPE_REQUIRED",
      "Provide project_id (UUID), app_name with a chat session, or use_session_draft for the open chat artifact. Never pass an app name as project_id.",
    );
  }

  const candidates = await listAppScopeCandidatesForSession(privyUserId, sessionId);

  if (input.app_name?.trim()) {
    const match = pickBestCandidate(candidates, input.app_name.trim());
    if (!match) {
      throw new AppError(404, "APP_NOT_FOUND", `No app matching "${input.app_name}" in this chat.`, {
        hint: "Call list_session_projects to see saved projects and the chat draft name.",
        available_apps: candidates.map((candidate) => ({
          name: candidate.name,
          project_id: candidate.project_id ?? null,
          session_draft: candidate.kind === "session_draft",
        })),
      });
    }

    if (match.kind === "project" && match.project_id) {
      return { kind: "project", project_id: match.project_id, name: match.name };
    }
    return { kind: "session_draft", session_id: sessionId, name: match.name };
  }

  if (input.use_session_draft) {
    const draft = candidates.find((candidate) => candidate.kind === "session_draft");
    if (draft) {
      return { kind: "session_draft", session_id: sessionId, name: draft.name };
    }
  }

  if (candidates.length === 1) {
    const only = candidates[0]!;
    if (only.kind === "project" && only.project_id) {
      return { kind: "project", project_id: only.project_id, name: only.name };
    }
    if (only.kind === "session_draft") {
      return { kind: "session_draft", session_id: sessionId, name: only.name };
    }
  }

  const draft = candidates.find((candidate) => candidate.kind === "session_draft");
  const saved = candidates.filter((candidate) => candidate.kind === "project");
  if (draft && saved.length === 0) {
    return { kind: "session_draft", session_id: sessionId, name: draft.name };
  }

  throw new AppError(
    400,
    "APP_SCOPE_AMBIGUOUS",
    "Multiple apps in this chat — pass app_name (e.g. \"Uniswap\") or project_id from list_session_projects.",
    {
      available_apps: candidates.map((candidate) => ({
        name: candidate.name,
        project_id: candidate.project_id ?? null,
        session_draft: candidate.kind === "session_draft",
      })),
    },
  );
}
