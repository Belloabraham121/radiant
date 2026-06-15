import type { ChatMessage, ChatMessageRole, Prisma } from "@prisma/client";
import { getAgentContextConfig } from "../../config/agent.js";
import { prisma } from "../../infrastructure/postgres/client.js";
import type { PinnedAppScope } from "../projects/pinned-app-scope.types.js";

export async function listMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
  return prisma.chatMessage.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: "asc" },
  });
}

/** Recent thread messages for agent context (newest-first query, returned ascending). */
export async function listRecentMessagesBySessionId(
  sessionId: string,
  limit?: number,
): Promise<ChatMessage[]> {
  const { maxMessages } = getAgentContextConfig();
  const take = limit ?? maxMessages;

  const recent = await prisma.chatMessage.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: "desc" },
    take,
  });

  return recent.reverse();
}

export async function appendMessage(
  sessionId: string,
  role: ChatMessageRole,
  content: string,
  toolCalls?: Prisma.InputJsonValue,
  appScope?: PinnedAppScope,
): Promise<ChatMessage> {
  return prisma.chatMessage.create({
    data: {
      session_id: sessionId,
      role,
      content,
      tool_calls: toolCalls ?? undefined,
      app_scope: appScope ?? undefined,
    },
  });
}
