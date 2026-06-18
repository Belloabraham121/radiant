import type { ToolCallRecord } from "../agent/agent.types.js";
import { GENERATE_APP_TOOL_NAME } from "./generate-app.tool.js";
import { EDIT_APP_TOOL_NAME } from "./edit-app.tool.js";
import type { ArtifactPayload, GenerateAppResult } from "./project.types.js";

const ARTIFACT_TOOL_NAMES: Set<string> = new Set([GENERATE_APP_TOOL_NAME, EDIT_APP_TOOL_NAME]);

export function extractArtifactFromToolCalls(toolCalls: ToolCallRecord[]): ArtifactPayload | null {
  let latest: ArtifactPayload | null = null;
  for (const call of toolCalls) {
    if (!ARTIFACT_TOOL_NAMES.has(call.name)) continue;
    const result = call.result;
    if (!result || typeof result !== "object") continue;
    const artifact = (result as GenerateAppResult).artifact;
    if (artifact) latest = artifact;
  }
  return latest;
}
