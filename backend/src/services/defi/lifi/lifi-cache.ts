import { filterEnabledEvmChainIds } from "../../../config/supported-tokens.js";
import { getDefiCacheConfig } from "../../../config/defi-cache.js";
import { cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";
import { defiCachedFetch, hashQuoteParams } from "../cache.js";
import type { Route } from "@lifi/types";

/** Li-Fi catalog cache keys — filtered to `ENABLED_EVM_CHAIN_IDS` at fetch time. */
export function lifiChainsCacheKey(): string {
  return "defi:lifi:catalog:chains";
}

export function lifiTokensCacheKey(chainIds: number[]): string {
  const filtered = filterEnabledEvmChainIds(chainIds).sort((a: number, b: number) => a - b);
  return `defi:lifi:catalog:tokens:${filtered.join(",")}`;
}

export function lifiConnectionsCacheKey(): string {
  return "defi:lifi:catalog:connections";
}

export function lifiToolsCacheKey(): string {
  return "defi:lifi:catalog:tools";
}

export function lifiQuoteCacheKey(params: Record<string, unknown>): string {
  return `defi:lifi:quote:${hashQuoteParams(params)}`;
}

export function lifiRoutesListCacheKey(params: Record<string, unknown>): string {
  return `defi:lifi:cross_chain_routes:${hashQuoteParams(params)}`;
}

export function lifiRouteStoreKey(routeId: string): string {
  return `defi:lifi:route:${routeId}`;
}

export function lifiStatusCacheKey(txHash: string, fromChain: number, toChain: number): string {
  return `defi:lifi:status:${fromChain}:${toChain}:${txHash.toLowerCase()}`;
}

/** Phase 1 — wrap Li-Fi HTTP reads with catalog / quote TTLs. */
export async function lifiCachedCatalogFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().catalogCacheTtlSeconds, fetcher);
}

export async function lifiCachedQuoteFetch<T>(
  params: Record<string, unknown>,
  fetcher: () => Promise<T>,
  options?: { skipCache?: boolean },
): Promise<T> {
  return defiCachedFetch(
    lifiQuoteCacheKey(params),
    getDefiCacheConfig().quoteDedupeTtlSeconds,
    fetcher,
    options?.skipCache ? { skipCache: true } : undefined,
  );
}

export async function lifiCachedStatusFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().statusCacheTtlSeconds, fetcher);
}

const ROUTE_STORE_TTL_SECONDS = 15 * 60;

/** Store a Li-Fi route snapshot for execute-by-route_id (read path only). */
export async function storeLifiRoute(routeId: string, route: Route): Promise<void> {
  await cacheSet(lifiRouteStoreKey(routeId), route, ROUTE_STORE_TTL_SECONDS);
}

export async function getStoredLifiRoute(routeId: string): Promise<Route | null> {
  return cacheGet<Route>(lifiRouteStoreKey(routeId));
}
