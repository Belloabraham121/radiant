import type { ChatToolCall } from "@/lib/chat-api";
import type { ArtifactPayload } from "@/lib/artifact-types";

const ARTIFACT_TOOL_NAMES = new Set(["generate_app", "edit_app"]);

export function extractArtifactFromToolCalls(toolCalls: ChatToolCall[]): ArtifactPayload | null {
  let latest: ArtifactPayload | null = null;
  for (const call of toolCalls) {
    if (!ARTIFACT_TOOL_NAMES.has(call.name)) continue;
    const result = call.result;
    if (!result || typeof result !== "object") continue;
    const artifact = (result as { artifact?: ArtifactPayload }).artifact;
    if (artifact) latest = artifact;
  }
  return latest;
}
