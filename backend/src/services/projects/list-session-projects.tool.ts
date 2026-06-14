import { listSessionProjectsForUser } from "./project-artifact.service.js";

export const LIST_SESSION_PROJECTS_TOOL_NAME = "list_session_projects" as const;

export const listSessionProjectsToolDefinition = {
  name: LIST_SESSION_PROJECTS_TOOL_NAME,
  description:
    "List app projects created in the current chat session. " +
    "Use before generate_app when the user wants a new app vs updating an existing one — " +
    "omit project_id to create a new project; pass project_id to update a listed project.",
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

  const projects = await listSessionProjectsForUser(privyUserId, context.sessionId);
  return {
    session_id: context.sessionId,
    projects,
    hint:
      projects.length === 0
        ? "No projects in this chat yet — call generate_app without project_id to create one."
        : "Pass project_id in generate_app to update an existing project; omit project_id to create another app in this chat.",
  };
}
