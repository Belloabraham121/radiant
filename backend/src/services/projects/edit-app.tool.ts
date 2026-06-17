import { z } from "zod";
import { editAppForUser } from "./edit-app.service.js";

export const EDIT_APP_TOOL_NAME = "edit_app" as const;

const editAppInputSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  edits: z
    .array(
      z.object({
        path: z.string().min(1),
        old_string: z.string().min(1),
        new_string: z.string(),
      }),
    )
    .min(1),
});

export type EditAppInput = z.infer<typeof editAppInputSchema>;

export const editAppToolDefinition = {
  name: EDIT_APP_TOOL_NAME,
  description:
    "Make targeted edits to specific files in the current artifact without regenerating everything. " +
    "Each edit replaces an exact string in a file with a new string (like find-and-replace). " +
    "Use for small changes: fonts, colors, text, adding/removing a CSS class, tweaking a single component. " +
    "Use generate_app instead when creating a new app from scratch or rewriting most files. " +
    "The old_string must appear exactly once in the file — include surrounding context if needed to make it unique.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Existing saved project UUID to edit. Omit for the current session draft.",
        nullable: true,
      },
      edits: {
        type: "array",
        description: "List of string-replace edits to apply.",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path to edit (e.g. app/page.tsx, app/globals.css, components/SwapForm.tsx).",
            },
            old_string: {
              type: "string",
              description: "Exact string to find in the file. Must appear exactly once. Include surrounding lines if needed to disambiguate.",
            },
            new_string: {
              type: "string",
              description: "Replacement string. Can be empty to delete the old_string.",
            },
          },
          required: ["path", "old_string", "new_string"],
          additionalProperties: false,
        },
      },
    },
    required: ["edits"],
    additionalProperties: false,
  },
};

export async function runEditAppTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: { sessionId?: string } = {},
): Promise<unknown> {
  const parsed = editAppInputSchema.parse(input);
  return editAppForUser(privyUserId, parsed, context);
}
