import { getRedisClient } from "../redis/client.js";

export type TokenBucketConfig = {
  capacity: number;
  /** Milliseconds between adding one token (up to capacity). */
  refillIntervalMs: number;
};

type BucketState = {
  tokens: number;
  lastRefillMs: number;
};

const memoryBuckets = new Map<string, BucketState>();

function refillTokens(state: BucketState, config: TokenBucketConfig, now: number): number {
  const elapsed = now - state.lastRefillMs;
  if (elapsed <= 0) return state.tokens;

  const tokensToAdd = Math.floor(elapsed / config.refillIntervalMs);
  if (tokensToAdd <= 0) return state.tokens;

  return Math.min(config.capacity, state.tokens + tokensToAdd);
}

async function readBucketState(key: string): Promise<BucketState | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`ratelimit:bucket:${key}`);
      if (raw) return JSON.parse(raw) as BucketState;
    } catch {
      // fall through
    }
  }

  return memoryBuckets.get(key) ?? null;
}

async function writeBucketState(key: string, state: BucketState): Promise<void> {
  memoryBuckets.set(key, state);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(`ratelimit:bucket:${key}`, JSON.stringify(state));
    } catch {
      // memory already updated
    }
  }
}

/**
 * Token-bucket rate limiter. Returns true when the cost was consumed, false when limited.
 */
export async function tryConsumeTokenBucket(
  key: string,
  config: TokenBucketConfig,
  cost = 1,
): Promise<boolean> {
  const now = Date.now();
  const existing = (await readBucketState(key)) ?? {
    tokens: config.capacity,
    lastRefillMs: now,
  };

  const tokens = refillTokens(existing, config, now);
  if (tokens < cost) {
    await writeBucketState(key, { tokens, lastRefillMs: now });
    return false;
  }

  await writeBucketState(key, {
    tokens: tokens - cost,
    lastRefillMs: now,
  });
  return true;
}

/** Test hook */
export function clearTokenBucketsForTests(): void {
  memoryBuckets.clear();
}
