import { getSessionDraftSummaryForUser } from "./generate-app.service.js";
import { listSessionProjectsForUser } from "./project-artifact.service.js";

export const LIST_SESSION_PROJECTS_TOOL_NAME = "list_session_projects" as const;

export const listSessionProjectsToolDefinition = {
  name: LIST_SESSION_PROJECTS_TOOL_NAME,
  description:
    "List saved app projects linked to the current chat session, and whether a chat-only draft exists. " +
    "Use before generate_app when updating a saved project (pass project_id) vs iterating a chat mockup (omit project_id).",
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

  const [projects, draft] = await Promise.all([
    listSessionProjectsForUser(privyUserId, context.sessionId),
    getSessionDraftSummaryForUser(privyUserId, context.sessionId),
  ]);

  return {
    session_id: context.sessionId,
    projects,
    draft,
    hint:
      projects.length === 0 && !draft?.has_draft
        ? "No draft yet — call generate_app to build in chat (not saved to Projects until save_project or save_to_project)."
        : draft?.has_draft
          ? "Chat draft exists — iterate with generate_app (no project_id). Save with save_project or Save to Projects in the UI."
          : "Pass project_id in generate_app to update a saved project.",
  };
}
