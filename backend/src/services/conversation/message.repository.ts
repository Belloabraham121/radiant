import type { ChatMessage, ChatMessageRole, Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export async function listMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
  return prisma.chatMessage.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: "asc" },
  });
}

export async function appendMessage(
  sessionId: string,
  role: ChatMessageRole,
  content: string,
  toolCalls?: Prisma.InputJsonValue,
): Promise<ChatMessage> {
  return prisma.chatMessage.create({
    data: {
      session_id: sessionId,
      role,
      content,
      tool_calls: toolCalls ?? undefined,
    },
  });
}
