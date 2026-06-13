import type { ChatMessageRole } from "@prisma/client";
import { getAgentContextConfig } from "../../config/agent.js";
import type { AgentTurnMessage } from "./runtime/types.js";

type ContextMessage = {
  role: ChatMessageRole;
  content: string;
};

/** Build user/assistant pairs for the agent runtime, capped by count and total chars. */
export function buildAgentContextMessages(
  messages: ContextMessage[],
  options?: { maxMessages?: number; maxChars?: number },
): AgentTurnMessage[] {
  const { maxMessages, maxChars } = {
    ...getAgentContextConfig(),
    ...options,
  };

  let selected = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-maxMessages);

  while (selected.length > 0) {
    const totalChars = selected.reduce((sum, message) => sum + message.content.length, 0);
    if (totalChars <= maxChars) break;
    selected = selected.slice(1);
  }

  return selected.map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content,
  }));
}
