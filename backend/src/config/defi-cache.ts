import { z } from "zod";
import { optional } from "./optional-env.js";

const defiCacheEnvSchema = z.object({
  DEFI_CATALOG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  DEFI_TOKEN_META_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  DEFI_QUOTE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(10),
  DEFI_QUOTE_DEDUPE_TTL_SECONDS: z.coerce.number().int().positive().default(5),
  DEFI_PRICE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(45),
  DEFI_BALANCE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(20),
  DEFI_STATUS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(15),
  DEFI_TOKEN_RESOLVE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  DEFI_CACHE_TTL_JITTER_SECONDS: z.coerce.number().int().nonnegative().default(5),
  TOKEN_RESOLVE_RATE_LIMIT_CAPACITY: z.coerce.number().int().positive().default(60),
  TOKEN_RESOLVE_RATE_LIMIT_REFILL_MS: z.coerce.number().int().positive().default(1000),
});

export type DefiCacheConfig = {
  catalogCacheTtlSeconds: number;
  tokenMetaCacheTtlSeconds: number;
  quoteCacheTtlSeconds: number;
  quoteDedupeTtlSeconds: number;
  priceCacheTtlSeconds: number;
  balanceCacheTtlSeconds: number;
  statusCacheTtlSeconds: number;
  tokenResolveCacheTtlSeconds: number;
  ttlJitterSeconds: number;
  tokenResolveRateLimitCapacity: number;
  tokenResolveRateLimitRefillMs: number;
};

let cached: DefiCacheConfig | undefined;

export function getDefiCacheConfig(): DefiCacheConfig {
  if (!cached) {
    const env = defiCacheEnvSchema.parse({
      DEFI_CATALOG_CACHE_TTL_SECONDS: optional("DEFI_CATALOG_CACHE_TTL_SECONDS", "600"),
      DEFI_TOKEN_META_CACHE_TTL_SECONDS: optional("DEFI_TOKEN_META_CACHE_TTL_SECONDS", "3600"),
      DEFI_QUOTE_CACHE_TTL_SECONDS: optional("DEFI_QUOTE_CACHE_TTL_SECONDS", "10"),
      DEFI_QUOTE_DEDUPE_TTL_SECONDS: optional("DEFI_QUOTE_DEDUPE_TTL_SECONDS", "5"),
      DEFI_PRICE_CACHE_TTL_SECONDS: optional("DEFI_PRICE_CACHE_TTL_SECONDS", "45"),
      DEFI_BALANCE_CACHE_TTL_SECONDS: optional("DEFI_BALANCE_CACHE_TTL_SECONDS", "20"),
      DEFI_STATUS_CACHE_TTL_SECONDS: optional("DEFI_STATUS_CACHE_TTL_SECONDS", "15"),
      DEFI_TOKEN_RESOLVE_CACHE_TTL_SECONDS: optional("DEFI_TOKEN_RESOLVE_CACHE_TTL_SECONDS", "30"),
      DEFI_CACHE_TTL_JITTER_SECONDS: optional("DEFI_CACHE_TTL_JITTER_SECONDS", "5"),
      TOKEN_RESOLVE_RATE_LIMIT_CAPACITY: optional("TOKEN_RESOLVE_RATE_LIMIT_CAPACITY", "60"),
      TOKEN_RESOLVE_RATE_LIMIT_REFILL_MS: optional("TOKEN_RESOLVE_RATE_LIMIT_REFILL_MS", "1000"),
    });

    cached = {
      catalogCacheTtlSeconds: env.DEFI_CATALOG_CACHE_TTL_SECONDS,
      tokenMetaCacheTtlSeconds: env.DEFI_TOKEN_META_CACHE_TTL_SECONDS,
      quoteCacheTtlSeconds: env.DEFI_QUOTE_CACHE_TTL_SECONDS,
      quoteDedupeTtlSeconds: env.DEFI_QUOTE_DEDUPE_TTL_SECONDS,
      priceCacheTtlSeconds: env.DEFI_PRICE_CACHE_TTL_SECONDS,
      balanceCacheTtlSeconds: env.DEFI_BALANCE_CACHE_TTL_SECONDS,
      statusCacheTtlSeconds: env.DEFI_STATUS_CACHE_TTL_SECONDS,
      tokenResolveCacheTtlSeconds: env.DEFI_TOKEN_RESOLVE_CACHE_TTL_SECONDS,
      ttlJitterSeconds: env.DEFI_CACHE_TTL_JITTER_SECONDS,
      tokenResolveRateLimitCapacity: env.TOKEN_RESOLVE_RATE_LIMIT_CAPACITY,
      tokenResolveRateLimitRefillMs: env.TOKEN_RESOLVE_RATE_LIMIT_REFILL_MS,
    };
  }
  return cached;
}

/** Test hook — reset cached DeFi cache config between tests. */
export function resetDefiCacheConfigForTests(): void {
  cached = undefined;
}
