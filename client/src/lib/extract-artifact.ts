import type { ChatToolCall } from "@/lib/chat-api";
import type { ArtifactPayload } from "@/lib/artifact-types";

const GENERATE_APP_TOOL_NAME = "generate_app";

export function extractArtifactFromToolCalls(toolCalls: ChatToolCall[]): ArtifactPayload | null {
  for (const call of toolCalls) {
    if (call.name !== GENERATE_APP_TOOL_NAME) continue;
    const result = call.result;
    if (!result || typeof result !== "object") continue;
    const artifact = (result as { artifact?: ArtifactPayload }).artifact;
    if (artifact) return artifact;
  }
  return null;
}
