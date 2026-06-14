import { listPublicApps } from "../apps/app-catalog.service.js";

export const LIST_PUBLIC_APPS_TOOL_NAME = "list_public_apps" as const;

export const listPublicAppsToolDefinition = {
  name: LIST_PUBLIC_APPS_TOOL_NAME,
  description:
    "List public apps in the Radiant explorer catalog. " +
    "Use before install_app when the user wants to browse or install a community app.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description: "Optional category filter",
      },
      search: {
        type: "string",
        description: "Optional search term (name, tagline, category)",
      },
      sort: {
        type: "string",
        enum: ["newest", "installs", "name"],
        description: "Sort order (default newest)",
      },
    },
    additionalProperties: false,
  },
};

export async function runListPublicAppsTool(
  _privyUserId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const query = {
    ...(typeof input.category === "string" ? { category: input.category } : {}),
    ...(typeof input.search === "string" ? { search: input.search } : {}),
    ...(typeof input.sort === "string" ? { sort: input.sort } : {}),
  };

  const catalog = await listPublicApps(query);
  return {
    ...catalog,
    hint:
      catalog.apps.length === 0
        ? "No public apps yet — users publish live projects to the explorer."
        : "Call install_app with project_id to install; user opens /app/installed/:id/run in Radiant.",
  };
}
