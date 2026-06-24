import { getDefiCacheConfig } from "../../../config/defi-cache.js";
import { getSoroswapConfig } from "../../../config/soroswap.js";
import { defiCachedFetch, hashQuoteParams } from "../cache.js";

export function soroswapTokensCacheKey(): string {
  return `defi:soroswap:catalog:tokens:${getSoroswapConfig().network}`;
}

export function soroswapHealthCacheKey(): string {
  return `defi:soroswap:catalog:health:${getSoroswapConfig().network}`;
}

export function soroswapQuoteCacheKey(params: Record<string, unknown>): string {
  return `defi:soroswap:quote:${hashQuoteParams(params)}`;
}

/** Phase 2 — wrap Soroswap HTTP reads. */
export async function soroswapCachedCatalogFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().catalogCacheTtlSeconds, fetcher);
}

export async function soroswapCachedQuoteFetch<T>(
  params: Record<string, unknown>,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(
    soroswapQuoteCacheKey(params),
    getDefiCacheConfig().quoteDedupeTtlSeconds,
    fetcher,
  );
}
