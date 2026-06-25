import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/postgres/client.js";

export type AgentSessionStateSnapshot = {
  clarification: unknown | null;
  workflow: unknown | null;
};

/** Upsert the durable snapshot of a session's in-flight agent state. */
export async function upsertAgentSessionState(
  sessionId: string,
  snapshot: AgentSessionStateSnapshot,
): Promise<void> {
  const clarification = (snapshot.clarification ?? null) as Prisma.InputJsonValue | undefined;
  const workflow = (snapshot.workflow ?? null) as Prisma.InputJsonValue | undefined;
  await prisma.agentSessionState.upsert({
    where: { session_id: sessionId },
    create: {
      session_id: sessionId,
      clarification: clarification ?? Prisma.JsonNull,
      workflow: workflow ?? Prisma.JsonNull,
    },
    update: {
      clarification: clarification ?? Prisma.JsonNull,
      workflow: workflow ?? Prisma.JsonNull,
    },
  });
}

export async function getAgentSessionState(
  sessionId: string,
): Promise<AgentSessionStateSnapshot | null> {
  const row = await prisma.agentSessionState.findUnique({ where: { session_id: sessionId } });
  if (!row) {
    return null;
  }
  return {
    clarification: row.clarification ?? null,
    workflow: row.workflow ?? null,
  };
}

export async function deleteAgentSessionState(sessionId: string): Promise<void> {
  await prisma.agentSessionState.deleteMany({ where: { session_id: sessionId } });
}

/** Prune snapshots older than the session-state TTL. */
export async function deleteAgentSessionStatesOlderThan(cutoff: Date): Promise<number> {
  const result = await prisma.agentSessionState.deleteMany({
    where: { updated_at: { lt: cutoff } },
  });
  return result.count;
}
