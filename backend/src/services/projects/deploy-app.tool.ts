import { startDeployForUser } from "../deploy/deploy.service.js";

export const DEPLOY_APP_TOOL_NAME = "deploy_app" as const;

export const deployAppToolDefinition = {
  name: DEPLOY_APP_TOOL_NAME,
  description:
    "Verify a project builds in the sandbox and mark it ready in Radiant. " +
    "Apps run inside Radiant only (Projects or chat preview) — not as external URLs. " +
    "Usually unnecessary after generate_app, which already saves the app. Requires project_id.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: { type: "string", description: "Project UUID to verify." },
    },
    required: ["project_id"],
    additionalProperties: false,
  },
};

export async function runDeployAppTool(
  privyUserId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const projectId = typeof input.project_id === "string" ? input.project_id : "";
  if (!projectId) {
    throw new Error("project_id is required");
  }

  return startDeployForUser(privyUserId, projectId);
}
