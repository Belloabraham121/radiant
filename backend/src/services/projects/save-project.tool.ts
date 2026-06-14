import { saveSessionDraftToProjectForUser } from "./generate-app.service.js";

export const SAVE_PROJECT_TOOL_NAME = "save_project" as const;

export const saveProjectToolDefinition = {
  name: SAVE_PROJECT_TOOL_NAME,
  description:
    "Save the current chat session draft to Projects so it appears on the Projects page and can be opened or published. " +
    "Use when the user asks to save, keep, or add the app they built in chat to their projects. " +
    "Requires an active chat session with a draft from generate_app.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Optional existing project UUID to update instead of creating a new project.",
        nullable: true,
      },
      name: { type: "string", description: "Optional override for the project name." },
      tagline: { type: "string", description: "Optional override for the tagline." },
    },
    additionalProperties: false,
  },
};

export async function runSaveProjectTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: { sessionId?: string } = {},
): Promise<unknown> {
  if (!context.sessionId) {
    return {
      error: {
        code: "SESSION_REQUIRED",
        message: "save_project requires an active chat session with a draft artifact.",
      },
    };
  }

  const projectId =
    typeof input.project_id === "string" && input.project_id.length > 0
      ? input.project_id
      : undefined;

  const result = await saveSessionDraftToProjectForUser(privyUserId, context.sessionId, {
    ...(projectId ? { project_id: projectId } : {}),
    ...(typeof input.name === "string" ? { name: input.name } : {}),
    ...(typeof input.tagline === "string" ? { tagline: input.tagline } : {}),
  });

  return {
    ...result,
    message: `Saved to Projects as "${result.name}". Open from Projects or continue editing with project_id.`,
  };
}
