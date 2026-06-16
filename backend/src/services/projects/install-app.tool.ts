import { installPublicAppForUser } from "../apps/app-installation.service.js";

export const INSTALL_APP_TOOL_NAME = "install_app" as const;

export const installAppToolDefinition = {
  name: INSTALL_APP_TOOL_NAME,
  description:
    "Install a public app from the Radiant explorer for the current user. " +
    "Returns an installation_id to open in Radiant. Use list_public_apps to discover apps.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Public app project UUID from the explorer catalog",
      },
    },
    required: ["project_id"],
    additionalProperties: false,
  },
};

export async function runInstallAppTool(
  privyUserId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const projectId = typeof input.project_id === "string" ? input.project_id : "";
  if (!projectId) {
    return { error: { code: "VALIDATION_ERROR", message: "project_id is required" } };
  }

  const result = await installPublicAppForUser(privyUserId, projectId);
  const open_path = `/app/installed/${result.installation_id}/run`;
  return {
    ...result,
    open_path,
    message: result.already_installed
      ? `Already installed — open at ${open_path}`
      : `Installed ${result.app_name} — open at ${open_path}`,
  };
}
