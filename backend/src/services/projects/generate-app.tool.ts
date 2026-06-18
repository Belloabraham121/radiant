import { generateAppForUser } from "./generate-app.service.js";
import { normalizeGenerateAppInput } from "./normalize-generate-app-input.js";
import { generateAppInputSchema } from "./project.types.js";
import type { PinnedAppScope } from "./pinned-app-scope.types.js";

export const GENERATE_APP_TOOL_NAME = "generate_app" as const;

export const generateAppToolDefinition = {
  name: GENERATE_APP_TOOL_NAME,
  description:
    "Create or rebuild a UI in the artifact panel. Prefer edit_app for tweaks to an existing pinned or session app. " +
    "When an app is pinned, project scope is applied automatically. " +
    "Partial file lists merge with existing sources — you do not need to resend every file.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Existing saved project UUID to update.",
        nullable: true,
      },
      save_to_project: {
        type: "boolean",
        description:
          "Set true when the user explicitly wants the app saved to Projects. Default false (chat draft only).",
      },
      name: { type: "string", description: "Short project name shown in Projects." },
      tagline: { type: "string", description: "Optional one-line description." },
      template: {
        type: "string",
        enum: ["custom", "escrow", "swap", "prediction", "margin"],
        description:
          "Use custom for agent-generated UI (default). template margin injects the reference MarginTradingApp scaffold. swap/escrow/prediction are legacy metadata labels only.",
      },
      files: {
        type: "array",
        description:
          "Source files (Next.js App Router: app/, components/, lib/). Must be a JSON array — include app/page.tsx.",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
          additionalProperties: false,
        },
      },
    },
    required: ["name", "files"],
    additionalProperties: false,
  },
};

export async function runGenerateAppTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: { sessionId?: string; rawArguments?: string; pinnedAppScope?: PinnedAppScope | null } = {},
): Promise<unknown> {
  const normalized = normalizeGenerateAppInput(input, context.rawArguments ?? "");
  const parsed = generateAppInputSchema.parse(normalized);
  return generateAppForUser(privyUserId, parsed, context);
}
