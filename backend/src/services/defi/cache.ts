import { createHash } from "node:crypto";
import { getDefiCacheConfig } from "../../config/defi-cache.js";
import { cacheGet, cacheSet, cacheDelete, clearMemoryCacheForTests } from "../../infrastructure/redis/cache.js";
import type { ChainId } from "../chains/types.js";

export type DefiCachedFetchOptions = {
  /** Skip read/write cache (still participates in singleflight when concurrent). */
  skipCache?: boolean;
  jitterMaxSeconds?: number;
};

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Add random 0..N seconds to a base TTL so keys expire at staggered times.
 * Default jitter cap from `DEFI_CACHE_TTL_JITTER_SECONDS` (typically ~5s).
 */
export function applyTtlJitter(baseTtlSeconds: number, jitterMaxSeconds?: number): number {
  const maxJitter = jitterMaxSeconds ?? getDefiCacheConfig().ttlJitterSeconds;
  if (maxJitter <= 0) {
    return baseTtlSeconds;
  }
  const jitter = Math.floor(Math.random() * (maxJitter + 1));
  return baseTtlSeconds + jitter;
}

/**
 * Namespaced DeFi cache fetch with TTL jitter and singleflight stampede protection.
 *
 * Policy:
 * - Cached quotes are OK for `query_chain` read paths only.
 * - `execute_transaction` must re-quote or verify `expiresAt` at approval time.
 * - Never cache execution payloads (unsigned tx, XDR, calldata).
 * - Failed fetchers are never written to cache.
 */
export async function defiCachedFetch<T>(
  key: string,
  baseTtlSeconds: number,
  fetcher: () => Promise<T>,
  options?: DefiCachedFetchOptions,
): Promise<T> {
  if (!options?.skipCache) {
    const hit = await cacheGet<T>(key);
    if (hit !== null) {
      return hit;
    }
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    const value = await fetcher();
    if (!options?.skipCache) {
      const ttl = applyTtlJitter(baseTtlSeconds, options?.jitterMaxSeconds);
      await cacheSet(key, value, ttl);
    }
    return value;
  })();

  inFlight.set(key, promise);

  try {
    return await promise;
  } finally {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key);
    }
  }
}

/** Stable cache key for identical swap/bridge quote params (read dedupe only). */
export function hashQuoteParams(params: Record<string, unknown>): string {
  const stable = stableStringify(params);
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function defiBalanceCacheKey(
  chainId: ChainId,
  address: string,
  evmChainId?: number,
): string {
  const normalizedAddress = address.trim().toLowerCase();
  if (chainId === "ethereum") {
    return `defi:balance:ethereum:${evmChainId ?? "default"}:${normalizedAddress}`;
  }
  return `defi:balance:${chainId}:${normalizedAddress}`;
}

export function defiTokenResolveCacheKey(
  chainId: ChainId,
  inputHash: string,
  evmChainId?: number,
): string {
  if (chainId === "ethereum") {
    return `defi:token_resolve:ethereum:${evmChainId ?? "any"}:${inputHash}`;
  }
  return `defi:token_resolve:${chainId}:${inputHash}`;
}

/** Drop cached native balance after a successful on-chain mutation. */
export async function invalidateDefiBalanceCache(
  chainId: ChainId,
  address: string,
  evmChainId?: number,
): Promise<void> {
  await cacheDelete(defiBalanceCacheKey(chainId, address, evmChainId));
}

/** Test hook — clear in-memory cache and in-flight singleflight map. */
export function clearDefiCacheForTests(): void {
  clearMemoryCacheForTests();
  inFlight.clear();
}
