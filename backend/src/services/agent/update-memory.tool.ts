import type { UpdateMemoryInput, UpdateMemoryResult } from "../memory/agent-memory.types.js";
import { updateAgentMemory } from "../memory/agent-memory.service.js";

export const UPDATE_MEMORY_TOOL_NAME = "update_memory" as const;

export const updateMemoryToolDefinition = {
  name: UPDATE_MEMORY_TOOL_NAME,
  description:
    "Persist small stable user preferences or facts across all chat sessions. " +
    "Use for durable prefs (e.g. default chain) or facts the user explicitly wants remembered. " +
    "Do not store full chat transcripts or credentials.",
  input_schema: {
    type: "object" as const,
    properties: {
      default_chain_id: {
        type: "string",
        enum: ["sui", "ethereum", "solana"],
        description: "Optional preferred default chain for future tool calls.",
      },
      facts: {
        type: "array",
        description: "Facts to set or remove. Keys are stable identifiers.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "Stable fact key, e.g. savings_goal." },
            value: { type: "string", description: "Fact value when action is set." },
            action: {
              type: "string",
              enum: ["set", "remove"],
              description: "set (default) upserts the fact; remove deletes it.",
            },
          },
          required: ["key"],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

export async function runUpdateMemoryTool(
  privyUserId: string,
  input: UpdateMemoryInput,
): Promise<UpdateMemoryResult> {
  return updateAgentMemory(privyUserId, input);
}
