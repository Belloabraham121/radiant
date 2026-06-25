import { cacheDelete, cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";
import {
  getSessionClarification,
  restoreClarification,
} from "./clarification.store.js";
import {
  getSessionWorkflow,
  restoreSessionWorkflow,
} from "./session-workflow.store.js";
import {
  deleteAgentSessionState,
  getAgentSessionState,
  upsertAgentSessionState,
  type AgentSessionStateSnapshot,
} from "./agent-session-state.repository.js";
import type { SessionClarificationState } from "./clarification.types.js";
import type { SessionWorkflowState } from "./workflow.types.js";

const TTL_SECONDS = 60 * 60; // Mirror the in-memory clarification/workflow TTL.

function cacheKey(sessionId: string): string {
  return `agent:session-state:${sessionId}`;
}

/**
 * Snapshot a session's in-flight agent state (pending clarification + paused
 * workflow) to Redis (fast) and Postgres (durable). Call at the end of a chat
 * turn so a later continuation request can recover it after a restart. When the
 * session has no live state, the snapshot is cleared.
 */
export async function persistSessionStateSnapshot(sessionId: string): Promise<void> {
  const clarification = getSessionClarification(sessionId);
  const workflow = getSessionWorkflow(sessionId);

  if (!clarification && !workflow) {
    await Promise.allSettled([
      cacheDelete(cacheKey(sessionId)),
      deleteAgentSessionState(sessionId),
    ]);
    return;
  }

  const snapshot: AgentSessionStateSnapshot = {
    clarification: clarification ?? null,
    workflow: workflow ?? null,
  };

  // DB is the durable source of truth; Redis is a read-through cache. Postgres
  // must succeed (it survives restarts even when Redis is not configured), while
  // a Redis failure is non-fatal.
  await Promise.all([
    cacheSet(cacheKey(sessionId), snapshot, TTL_SECONDS).catch(() => undefined),
    upsertAgentSessionState(sessionId, snapshot),
  ]);
}

/**
 * Ensure the in-memory stores hold this session's state, loading from Redis
 * (then Postgres) if the process-local cache was lost (restart / other
 * instance). No-op when the state is already in memory.
 */
export async function hydrateSessionState(sessionId: string): Promise<void> {
  if (getSessionClarification(sessionId) || getSessionWorkflow(sessionId)) {
    return;
  }

  let snapshot = await cacheGet<AgentSessionStateSnapshot>(cacheKey(sessionId));
  if (!snapshot) {
    snapshot = await getAgentSessionState(sessionId);
    if (snapshot) {
      await cacheSet(cacheKey(sessionId), snapshot, TTL_SECONDS).catch(() => undefined);
    }
  }
  if (!snapshot) {
    return;
  }

  if (snapshot.clarification) {
    restoreClarification(snapshot.clarification as SessionClarificationState);
  }
  if (snapshot.workflow) {
    restoreSessionWorkflow(snapshot.workflow as SessionWorkflowState);
  }
}
