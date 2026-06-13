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
