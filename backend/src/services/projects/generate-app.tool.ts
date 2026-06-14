import { generateAppForUser } from "./generate-app.service.js";
import { normalizeGenerateAppInput } from "./normalize-generate-app-input.js";
import { generateAppInputSchema } from "./project.types.js";

export const GENERATE_APP_TOOL_NAME = "generate_app" as const;

export const generateAppToolDefinition = {
  name: GENERATE_APP_TOOL_NAME,
  description:
    "Create or update a UI in the chat artifact panel. By default saves a session draft only (not Projects). " +
    "JSON input: name (string), files (array of {path, content}), optional project_id, save_to_project, tagline, template. " +
    "Omit project_id for chat mockups. Pass project_id to update a saved project, or save_to_project: true when the user wants it in Projects. " +
    "Paths under app/, components/, lib/, or public/. Always include app/page.tsx.",
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
        enum: ["custom", "escrow", "swap", "prediction"],
        description: "custom = agent-generated UI; fixed templates are pre-built scaffold apps.",
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
  context: { sessionId?: string; rawArguments?: string } = {},
): Promise<unknown> {
  const normalized = normalizeGenerateAppInput(input, context.rawArguments ?? "");
  const parsed = generateAppInputSchema.parse(normalized);
  return generateAppForUser(privyUserId, parsed, context);
}
