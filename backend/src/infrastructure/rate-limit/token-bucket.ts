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

/**
 * Refill accrued tokens and advance the refill clock correctly. Critically, when
 * no whole token has accrued yet the clock is left untouched so partial progress
 * is preserved across calls — otherwise a denied request that rewrote
 * `lastRefillMs = now` would discard accrued time, and frequent retries would
 * keep an empty bucket starved forever.
 */
function refillBucket(state: BucketState, config: TokenBucketConfig, now: number): BucketState {
  const elapsed = now - state.lastRefillMs;
  if (elapsed <= 0) return state;

  const tokensToAdd = Math.floor(elapsed / config.refillIntervalMs);
  if (tokensToAdd <= 0) return state;

  const tokens = Math.min(config.capacity, state.tokens + tokensToAdd);
  // At capacity, anchor the clock to now (excess time doesn't bank); otherwise
  // advance only by the whole tokens actually credited.
  const lastRefillMs =
    tokens >= config.capacity
      ? now
      : state.lastRefillMs + tokensToAdd * config.refillIntervalMs;
  return { tokens, lastRefillMs };
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

  const refilled = refillBucket(existing, config, now);
  if (refilled.tokens < cost) {
    // Persist the refilled state (NOT lastRefillMs = now) so accrued time toward
    // the next token survives repeated denied attempts.
    await writeBucketState(key, refilled);
    return false;
  }

  await writeBucketState(key, {
    tokens: refilled.tokens - cost,
    lastRefillMs: refilled.lastRefillMs,
  });
  return true;
}

/** Test hook */
export function clearTokenBucketsForTests(): void {
  memoryBuckets.clear();
}
