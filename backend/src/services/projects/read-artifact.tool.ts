import { z } from "zod";
import { readArtifactForUser } from "./artifact-context.service.js";
import {
  mergePinnedAppScopeIntoArtifactTool,
  type PinnedAppScope,
} from "./pinned-app-scope.types.js";

export const READ_ARTIFACT_TOOL_NAME = "read_artifact" as const;

const readArtifactInputSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  paths: z.array(z.string().min(1)).optional(),
});

export const readArtifactToolDefinition = {
  name: READ_ARTIFACT_TOOL_NAME,
  description:
    "Read current source files for the pinned app, session draft, or saved project before editing. " +
    "Omit paths to list all user files; pass paths to load specific files only. " +
    "When the user pinned an app, scope is applied automatically.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Saved project UUID. Omit when editing the session draft or when an app is pinned.",
        nullable: true,
      },
      paths: {
        type: "array",
        description: "Optional file paths to load (e.g. components/Chart.tsx).",
        items: { type: "string" },
      },
    },
    additionalProperties: false,
  },
};

export async function runReadArtifactTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: { sessionId?: string; pinnedAppScope?: PinnedAppScope | null } = {},
): Promise<unknown> {
  const parsed = readArtifactInputSchema.parse(input);
  const scoped = mergePinnedAppScopeIntoArtifactTool(parsed, context.pinnedAppScope);
  const result = await readArtifactForUser(privyUserId, context.sessionId, scoped);

  const fileSummaries = result.files.map((file) => {
    const lines = file.content.split("\n");
    const preview = file.content.length <= 6000 ? file.content : file.content.slice(0, 6000) + "\n...";
    return `--- ${file.path} (${lines.length} lines) ---\n${preview}`;
  });

  return {
    name: result.name,
    file_count: result.files.length,
    files: result.files,
    summary:
      `Read ${result.files.length} file(s) from "${result.name}". ` +
      "Use EXACT snippets below as old_string in edit_app:\n\n" +
      fileSummaries.join("\n\n"),
  };
}
