import { randomUUID } from "node:crypto";
import type { ClarificationGap, SessionClarificationState } from "./clarification.types.js";

const clarificationsBySession = new Map<string, SessionClarificationState>();
const clarificationsById = new Map<string, SessionClarificationState>();

const TTL_MS = 60 * 60 * 1000;

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, state] of clarificationsById) {
    if (now - state.createdAt > TTL_MS) {
      clarificationsById.delete(id);
      clarificationsBySession.delete(state.sessionId);
    }
  }
}

export function startSessionClarification(
  state: Omit<SessionClarificationState, "id" | "createdAt">,
): SessionClarificationState {
  pruneExpired();
  const full: SessionClarificationState = {
    ...state,
    id: randomUUID(),
    createdAt: Date.now(),
  };
  clarificationsById.set(full.id, full);
  clarificationsBySession.set(full.sessionId, full);
  return full;
}

export function getClarificationById(id: string): SessionClarificationState | null {
  pruneExpired();
  return clarificationsById.get(id) ?? null;
}

/**
 * Re-insert a clarification loaded from durable storage (Redis/DB) without
 * minting a new id — used to rehydrate the in-memory cache after a restart.
 */
export function restoreClarification(state: SessionClarificationState): void {
  clarificationsById.set(state.id, state);
  clarificationsBySession.set(state.sessionId, state);
}

export function getSessionClarification(sessionId: string): SessionClarificationState | null {
  pruneExpired();
  return clarificationsBySession.get(sessionId) ?? null;
}

export function clearSessionClarification(sessionId: string): void {
  const state = clarificationsBySession.get(sessionId);
  if (state) {
    clarificationsById.delete(state.id);
  }
  clarificationsBySession.delete(sessionId);
}

/** Test hook */
export function clearAllClarificationsForTests(): void {
  clarificationsById.clear();
  clarificationsBySession.clear();
}
