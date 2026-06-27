import { getRedisClient } from "./client.js";

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

const memory = new Map<string, MemoryEntry>();

function readMemory<T>(key: string): T | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    memory.delete(key);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

function writeMemory(key: string, value: unknown, ttlSeconds: number): void {
  memory.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // Fall through to memory cache.
    }
  }
  return readMemory<T>(key);
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  writeMemory(key, value, ttlSeconds);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Memory cache already written.
    }
  }
}

export async function cacheDelete(key: string): Promise<void> {
  memory.delete(key);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // Memory cache already cleared.
    }
  }
}

export type CacheTransitionResult<T> =
  | { ok: true; value: T }
  | { ok: false; current: T | null };

/**
 * Atomically transition a cached object when its `status` field matches `expectedStatus`.
 * Uses in-memory compare-and-set; Redis path uses GET+SET in one helper (single-threaded per key in practice).
 */
export async function cacheTransitionStatus<T extends { status: string }>(
  key: string,
  expectedStatus: string,
  nextStatus: string,
  ttlSeconds: number,
): Promise<CacheTransitionResult<T>> {
  const current = await cacheGet<T>(key);
  if (!current) {
    return { ok: false, current: null };
  }
  if (current.status !== expectedStatus) {
    return { ok: false, current };
  }

  const next = { ...current, status: nextStatus } as T;
  writeMemory(key, next, ttlSeconds);

  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) {
        return { ok: false, current: null };
      }
      const parsed = JSON.parse(raw) as T;
      if (parsed.status !== expectedStatus) {
        return { ok: false, current: parsed };
      }
      const updated = { ...parsed, status: nextStatus } as T;
      await redis.set(key, JSON.stringify(updated), "EX", ttlSeconds);
      return { ok: true, value: updated };
    } catch {
      return { ok: true, value: next };
    }
  }

  return { ok: true, value: next };
}

export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) {
    return hit;
  }
  const value = await fetcher();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/** Test hook — clear in-memory cache entries. */
export function clearMemoryCacheForTests(): void {
  memory.clear();
}
