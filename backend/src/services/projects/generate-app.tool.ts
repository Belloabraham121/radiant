import { generateAppForUser } from "./generate-app.service.js";
import { generateAppInputSchema } from "./project.types.js";

export const GENERATE_APP_TOOL_NAME = "generate_app" as const;

export const generateAppToolDefinition = {
  name: GENERATE_APP_TOOL_NAME,
  description:
    "Create or update a user app project with React source files for the artifact panel. " +
    "Paths must be under src/ or public/ (e.g. src/App.tsx). Total source ≤512 KB. " +
    "Use when the user wants a UI built or updated — not for on-chain execution.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Existing project UUID to update, or null to create a new project.",
        nullable: true,
      },
      name: { type: "string", description: "Short project name shown in Projects." },
      tagline: { type: "string", description: "Optional one-line description." },
      template: {
        type: "string",
        enum: ["custom", "escrow", "swap", "prediction"],
        description: "custom = agent-generated UI; fixed templates use pre-built dist on deploy.",
      },
      files: {
        type: "array",
        description: "Source files to write (paths relative to src/ or public/).",
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
  context: { sessionId?: string } = {},
): Promise<unknown> {
  const parsed = generateAppInputSchema.parse(input);
  return generateAppForUser(privyUserId, parsed, context);
}
