import { publishProjectForUser } from "../apps/app-installation.service.js";

export const PUBLISH_APP_TOOL_NAME = "publish_app" as const;

export const publishAppToolDefinition = {
  name: PUBLISH_APP_TOOL_NAME,
  description:
    "Publish or unpublish the user's app on the Radiant explorer. " +
    "Project must be live with a saved artifact. Sets is_public, fee_bps, and category.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: { type: "string", description: "Project UUID to publish" },
      is_public: { type: "boolean", description: "true to list in explorer, false to delist" },
      fee_bps: {
        type: "number",
        description: "Optional creator fee in basis points (0–1000)",
      },
      category: {
        type: "string",
        description: "Explorer category: swap, payments, automation, savings, markets, escrow, alerts, offramp, staking, portfolio",
      },
      tagline: { type: "string", description: "Optional short listing tagline" },
    },
    required: ["project_id", "is_public"],
    additionalProperties: false,
  },
};

export async function runPublishAppTool(
  privyUserId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const projectId = typeof input.project_id === "string" ? input.project_id : "";
  if (!projectId) {
    return { error: { code: "VALIDATION_ERROR", message: "project_id is required" } };
  }

  const body = {
    is_public: input.is_public === true,
    ...(typeof input.fee_bps === "number" ? { fee_bps: input.fee_bps } : {}),
    ...(typeof input.category === "string" ? { category: input.category } : {}),
    ...(typeof input.tagline === "string" ? { tagline: input.tagline } : {}),
  };

  const result = await publishProjectForUser(privyUserId, projectId, body);
  return {
    ...result,
    message: result.is_public
      ? "App is now listed in the Radiant explorer"
      : "App removed from the explorer",
  };
}
