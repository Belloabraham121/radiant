import type { ToolCallRecord } from "../agent/agent.types.js";
import { GENERATE_APP_TOOL_NAME } from "./generate-app.tool.js";
import type { ArtifactPayload, GenerateAppResult } from "./project.types.js";

export function extractArtifactFromToolCalls(toolCalls: ToolCallRecord[]): ArtifactPayload | null {
  for (const call of toolCalls) {
    if (call.name !== GENERATE_APP_TOOL_NAME) continue;
    const result = call.result;
    if (!result || typeof result !== "object") continue;
    const artifact = (result as GenerateAppResult).artifact;
    if (artifact) return artifact;
  }
  return null;
}
