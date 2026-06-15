import { getSessionDraftSummaryForUser } from "./generate-app.service.js";
import {
  listAppScopeCandidatesForSession,
  type AppScopeCandidate,
} from "./app-scope-resolver.service.js";
import { listSessionProjectsForUser } from "./project-artifact.service.js";

export const LIST_SESSION_PROJECTS_TOOL_NAME = "list_session_projects" as const;

function toAvailableApps(candidates: AppScopeCandidate[]) {
  return candidates.map((candidate) => ({
    name: candidate.name,
    tagline: candidate.tagline ?? null,
    project_id: candidate.project_id ?? null,
    session_draft: candidate.kind === "session_draft",
    call_app_action_scope:
      candidate.kind === "session_draft"
        ? { use_session_draft: true, app_name: candidate.name }
        : { project_id: candidate.project_id, app_name: candidate.name },
  }));
}

export const listSessionProjectsToolDefinition = {
  name: LIST_SESSION_PROJECTS_TOOL_NAME,
  description:
    "List saved app projects linked to the current chat session and the chat-only artifact draft. " +
    "ALWAYS call this before call_app_action when the user names an app (e.g. \"my Uniswap app\") — use project_id or app_name from the result, never the app name as project_id.",
  input_schema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

export async function runListSessionProjectsTool(
  privyUserId: string,
  _input: Record<string, unknown>,
  context: { sessionId?: string } = {},
): Promise<unknown> {
  if (!context.sessionId) {
    return { projects: [], message: "No chat session — projects will be linked after the first message." };
  }

  const [projects, draft, candidates] = await Promise.all([
    listSessionProjectsForUser(privyUserId, context.sessionId),
    getSessionDraftSummaryForUser(privyUserId, context.sessionId),
    listAppScopeCandidatesForSession(privyUserId, context.sessionId),
  ]);

  const availableApps = toAvailableApps(candidates);

  return {
    session_id: context.sessionId,
    projects,
    draft,
    available_apps: availableApps,
    hint:
      projects.length === 0 && !draft?.has_draft
        ? "No draft yet — call generate_app to build in chat (not saved to Projects until save_project or save_to_project)."
        : draft?.has_draft
          ? "Chat draft exists — swap through it with call_app_action { app_name: \"" +
            (draft.name ?? "Chat draft") +
            "\", action, params } or { use_session_draft: true, action, params }."
          : "Pass project_id from available_apps in call_app_action, or app_name to match by name.",
  };
}
