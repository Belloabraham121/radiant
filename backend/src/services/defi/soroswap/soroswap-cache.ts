import { cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";
import { getDefiCacheConfig } from "../../../config/defi-cache.js";
import { getSoroswapConfig } from "../../../config/soroswap.js";
import { defiCachedFetch, hashQuoteParams, type DefiCachedFetchOptions } from "../cache.js";
import { SOROSWAP_QUOTE_TTL_MS } from "./soroswap-normalize.js";
import type { SoroswapStoredQuotePayload } from "./soroswap.types.js";

export function soroswapTokensCacheKey(): string {
  return `defi:soroswap:catalog:tokens:${getSoroswapConfig().network}`;
}

export function soroswapHealthCacheKey(): string {
  return `defi:soroswap:catalog:health:${getSoroswapConfig().network}`;
}

export function soroswapQuoteCacheKey(params: Record<string, unknown>): string {
  return `defi:soroswap:quote:${hashQuoteParams(params)}`;
}

export function soroswapQuoteStoreKey(quoteId: string): string {
  return `defi:soroswap:route:${quoteId}`;
}

function getSoroswapQuoteDedupeTtlSeconds(): number {
  const override = process.env.SOROSWAP_QUOTE_CACHE_TTL_SECONDS?.trim();
  if (override) {
    const parsed = Number.parseInt(override, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return getDefiCacheConfig().quoteDedupeTtlSeconds;
}

/** Phase 2 — wrap Soroswap HTTP catalog reads. */
export async function soroswapCachedCatalogFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().catalogCacheTtlSeconds, fetcher);
}

export async function soroswapCachedQuoteFetch<T>(
  params: Record<string, unknown>,
  fetcher: () => Promise<T>,
  options?: DefiCachedFetchOptions,
): Promise<T> {
  return defiCachedFetch(
    soroswapQuoteCacheKey(params),
    getSoroswapQuoteDedupeTtlSeconds(),
    fetcher,
    options,
  );
}

/** Store a Soroswap quote blob for execute-by-quote_id (separate from dedupe cache). */
export async function storeSoroswapQuote(
  quoteId: string,
  payload: SoroswapStoredQuotePayload,
  ttlSeconds?: number,
): Promise<void> {
  const ttl = ttlSeconds ?? Math.ceil(SOROSWAP_QUOTE_TTL_MS / 1000);
  await cacheSet(soroswapQuoteStoreKey(quoteId), payload, ttl);
}

export async function getStoredSoroswapQuote(
  quoteId: string,
): Promise<SoroswapStoredQuotePayload | null> {
  return cacheGet<SoroswapStoredQuotePayload>(soroswapQuoteStoreKey(quoteId));
}
