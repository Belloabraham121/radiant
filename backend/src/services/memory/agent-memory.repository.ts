import type { AgentMemory, Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import type { AgentMemoryData } from "./agent-memory.types.js";

export async function findAgentMemoryByUserId(userId: bigint): Promise<AgentMemory | null> {
  return prisma.agentMemory.findUnique({
    where: { user_id: userId },
  });
}

export async function upsertAgentMemory(
  userId: bigint,
  data: AgentMemoryData,
): Promise<AgentMemory> {
  return prisma.agentMemory.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      data: data as Prisma.InputJsonValue,
    },
    update: {
      data: data as Prisma.InputJsonValue,
    },
  });
}
