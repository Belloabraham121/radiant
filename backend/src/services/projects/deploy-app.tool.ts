import { AppError } from "../../errors/app-error.js";
import { startDeployForUser } from "../deploy/deploy.service.js";
import { saveSessionDraftToProjectForUser } from "./generate-app.service.js";
import { isUuid } from "./app-scope-resolver.service.js";

export const DEPLOY_APP_TOOL_NAME = "deploy_app" as const;

export const deployAppToolDefinition = {
  name: DEPLOY_APP_TOOL_NAME,
  description:
    "Verify a project builds in the sandbox and mark it ready in Radiant. " +
    "Apps run inside Radiant only (Projects or chat preview) — not as external URLs. " +
    "Usually unnecessary after generate_app, which already saves the app. " +
    "Requires a saved project UUID from list_session_projects — never pass an app name as project_id. " +
    "If the app is still a chat draft, omit project_id and the draft will be saved automatically before deploy.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description:
          "Saved project UUID from list_session_projects. Omit when deploying the open chat draft — it will be saved first.",
      },
    },
    additionalProperties: false,
  },
};

export async function runDeployAppTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: { sessionId?: string } = {},
): Promise<unknown> {
  let projectId =
    typeof input.project_id === "string" ? input.project_id.trim() : "";

  if (projectId && !isUuid(projectId)) {
    throw new AppError(
      400,
      "INVALID_PROJECT_ID",
      "project_id must be a UUID from list_session_projects — never an app name. " +
        "Call list_session_projects or save_project first, then pass the returned project_id.",
    );
  }

  if (!projectId) {
    if (!context.sessionId) {
      throw new AppError(
        400,
        "PROJECT_ID_REQUIRED",
        "project_id is required when not in a chat session. Call list_session_projects to get the UUID.",
      );
    }
    const saved = await saveSessionDraftToProjectForUser(
      privyUserId,
      context.sessionId,
      {},
    );
    projectId = saved.project_id;
  }

  return startDeployForUser(privyUserId, projectId);
}
