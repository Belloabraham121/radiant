import type { SessionWorkflowState, WorkflowPlan } from "./workflow.types.js";

const workflowsBySession = new Map<string, SessionWorkflowState>();

const TTL_MS = 60 * 60 * 1000;

function pruneExpired(): void {
  const now = Date.now();
  for (const [sessionId, workflow] of workflowsBySession) {
    if (now - workflow.createdAt > TTL_MS) {
      workflowsBySession.delete(sessionId);
    }
  }
}

export function startSessionWorkflow(sessionId: string, plan: WorkflowPlan): SessionWorkflowState {
  pruneExpired();
  const state: SessionWorkflowState = {
    sessionId,
    plan,
    currentStepIndex: 0,
    completed: [],
    ledger: [],
    status: "active",
    createdAt: Date.now(),
  };
  workflowsBySession.set(sessionId, state);
  return state;
}

export function getSessionWorkflow(sessionId: string): SessionWorkflowState | null {
  pruneExpired();
  return workflowsBySession.get(sessionId) ?? null;
}

export function updateSessionWorkflow(
  sessionId: string,
  patch: Partial<SessionWorkflowState>,
): SessionWorkflowState | null {
  const current = getSessionWorkflow(sessionId);
  if (!current) {
    return null;
  }
  const next = { ...current, ...patch };
  workflowsBySession.set(sessionId, next);
  return next;
}

export function clearSessionWorkflow(sessionId: string): void {
  workflowsBySession.delete(sessionId);
}

/**
 * Re-insert a workflow run loaded from durable storage (Redis/DB) — used to
 * rehydrate the in-memory cache after a restart so a paused workflow can resume.
 */
export function restoreSessionWorkflow(state: SessionWorkflowState): void {
  workflowsBySession.set(state.sessionId, state);
}

/** Test hook */
export function clearAllSessionWorkflowsForTests(): void {
  workflowsBySession.clear();
}
