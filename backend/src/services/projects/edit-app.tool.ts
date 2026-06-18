import { z } from "zod";
import { editAppForUser } from "./edit-app.service.js";

export const EDIT_APP_TOOL_NAME = "edit_app" as const;

const editAppInputSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  edits: z
    .array(
      z.object({
        path: z.string().min(1),
        old_string: z.string().optional(),
        new_string: z.string(),
        replace_file: z.boolean().optional(),
      }),
    )
    .min(1),
});

export type EditAppInput = z.infer<typeof editAppInputSchema>;

export const editAppToolDefinition = {
  name: EDIT_APP_TOOL_NAME,
  description:
    "Make surgical edits to specific files in the current artifact — preserves existing UI; only the targeted strings change. " +
    "DEFAULT: find-and-replace with old_string + new_string (include surrounding lines so old_string is unique). " +
    "Use for ALL incremental changes: add/remove fields, fonts, colors, text, labels, spacing, wiring. " +
    "replace_file: true is LAST RESORT ONLY after EDIT_STRING_NOT_FOUND when an entire file must be restructured — " +
    "never use it for small requests like adding inputs or tweaking styles. " +
    "Use generate_app only when creating from scratch or rewriting most of the app.",
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
              description:
                "Exact string to find in the file. Must appear exactly once. Omit when replace_file is true.",
            },
            new_string: {
              type: "string",
              description: "Replacement string, or full file contents when replace_file is true.",
            },
            replace_file: {
              type: "boolean",
              description:
                "LAST RESORT ONLY. When true, replace the entire file with new_string. Do not use for small UI tweaks.",
            },
          },
          required: ["path", "new_string"],
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
