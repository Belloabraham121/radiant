/** Buffer execute_in_app commands until an SSE client connects (avoids race during POST /chat). */

export type PendingExecuteInApp = {
  action: string;
  params: Record<string, unknown>;
  created_at: string;
};

const pendingBySession = new Map<string, PendingExecuteInApp[]>();
const MAX_PENDING_PER_SESSION = 8;
const PENDING_TTL_MS = 120_000;

function pruneStale(items: PendingExecuteInApp[]): PendingExecuteInApp[] {
  const cutoff = Date.now() - PENDING_TTL_MS;
  return items.filter((item) => Date.parse(item.created_at) >= cutoff);
}

export function bufferPendingExecuteInApp(
  sessionId: string,
  action: string,
  params: Record<string, unknown>,
): void {
  const existing = pruneStale(pendingBySession.get(sessionId) ?? []);
  existing.push({
    action,
    params,
    created_at: new Date().toISOString(),
  });
  while (existing.length > MAX_PENDING_PER_SESSION) {
    existing.shift();
  }
  pendingBySession.set(sessionId, existing);
}

export function drainPendingExecuteInApp(sessionId: string): PendingExecuteInApp[] {
  const items = pruneStale(pendingBySession.get(sessionId) ?? []);
  pendingBySession.delete(sessionId);
  return items;
}

/** Test hook */
export function resetPendingExecuteInAppForTests(): void {
  pendingBySession.clear();
}
