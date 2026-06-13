import { startDeployForUser } from "../deploy/deploy.service.js";

export const DEPLOY_APP_TOOL_NAME = "deploy_app" as const;

export const deployAppToolDefinition = {
  name: DEPLOY_APP_TOOL_NAME,
  description:
    "Deploy a project to Walrus Sites and return a permanent URL. " +
    "Use when the user wants to publish or deploy their app. Requires an existing project_id.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: { type: "string", description: "Project UUID to deploy." },
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
