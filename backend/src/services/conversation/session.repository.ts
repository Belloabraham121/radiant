import type { ChatSession, Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export type ChatSessionWithLatestMessage = ChatSession & {
  messages: Array<{ content: string }>;
};

export async function listSessionsByUserId(
  userId: bigint,
): Promise<ChatSessionWithLatestMessage[]> {
  return prisma.chatSession.findMany({
    where: {
      user_id: userId,
      messages: { some: {} },
    },
    orderBy: { updated_at: "desc" },
    include: {
      messages: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { content: true },
      },
    },
  });
}

export async function createSession(
  userId: bigint,
  title = "New chat",
): Promise<ChatSession> {
  return prisma.chatSession.create({
    data: {
      user_id: userId,
      title,
    },
  });
}

export async function findSessionById(sessionId: string): Promise<ChatSession | null> {
  return prisma.chatSession.findUnique({
    where: { id: sessionId },
  });
}

export async function findSessionForUser(
  sessionId: string,
  userId: bigint,
): Promise<ChatSession | null> {
  return prisma.chatSession.findFirst({
    where: {
      id: sessionId,
      user_id: userId,
    },
  });
}

export async function touchSession(
  sessionId: string,
  data: Pick<Prisma.ChatSessionUpdateInput, "title" | "updated_at"> = {},
): Promise<ChatSession> {
  return prisma.chatSession.update({
    where: { id: sessionId },
    data,
  });
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await prisma.chatSession.delete({
    where: { id: sessionId },
  });
}
