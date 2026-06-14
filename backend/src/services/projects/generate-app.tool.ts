import { generateAppForUser } from "./generate-app.service.js";
import { generateAppInputSchema } from "./project.types.js";

export const GENERATE_APP_TOOL_NAME = "generate_app" as const;

export const generateAppToolDefinition = {
  name: GENERATE_APP_TOOL_NAME,
  description:
    "Create or update a user Next.js app for the artifact panel. " +
    "Paths under app/, components/, lib/, or public/ (e.g. app/page.tsx, components/SwapForm.tsx). " +
    "Always include app/page.tsx. Use lib/radiant-client.ts for DeepBook swapQuote/poolInfo — platform APIs, not custom swap code. " +
    "Not for on-chain execution from chat (use execute_transaction when user asks to trade).",
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
        description: "Source files (Next.js App Router: app/, components/, lib/).",
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
