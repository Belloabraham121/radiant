import { getCanvasConfig } from "../../../config/canvas.js";
import { cacheDelete, cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";
import { getRedisClient } from "../../../infrastructure/redis/client.js";

const KILL_KEY_PREFIX = "canvas:policy:kill:";
const KILL_CHANNEL_PREFIX = "canvas:kill:";

type KillSwitchState = {
  enabled: boolean;
  updated_at: string;
};

const memoryKill = new Map<string, KillSwitchState>();

function killKey(workflowId: string): string {
  return `${KILL_KEY_PREFIX}${workflowId}`;
}

function killChannel(workflowId: string): string {
  return `${KILL_CHANNEL_PREFIX}${workflowId}`;
}

export async function getKillSwitchState(workflowId: string): Promise<boolean> {
  const cached = await cacheGet<KillSwitchState>(killKey(workflowId));
  if (cached) return cached.enabled;

  const mem = memoryKill.get(workflowId);
  return mem?.enabled ?? false;
}

export async function setKillSwitchState(workflowId: string, enabled: boolean): Promise<void> {
  const state: KillSwitchState = { enabled, updated_at: new Date().toISOString() };
  memoryKill.set(workflowId, state);

  const ttlSeconds = Math.max(60, Math.ceil(getCanvasConfig().killSwitchCacheTtlMs / 1000) * 120);
  await cacheSet(killKey(workflowId), state, ttlSeconds);

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.publish(killChannel(workflowId), JSON.stringify(state));
    } catch {
      // Pub/sub is best-effort; cache flag is authoritative.
    }
  }
}

export async function clearKillSwitchState(workflowId: string): Promise<void> {
  memoryKill.delete(workflowId);
  await cacheDelete(killKey(workflowId));
}

export async function assertKillSwitchClear(workflowId: string): Promise<void> {
  if (await getKillSwitchState(workflowId)) {
    throw new Error("Kill switch is active — execution halted before sign.");
  }
}

/** Test hook */
export function resetKillSwitchMemoryForTests(): void {
  memoryKill.clear();
}
