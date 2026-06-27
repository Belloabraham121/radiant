import { cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";
import { defiCachedFetch } from "../cache.js";
import type { SquidStoredRoutePayload } from "./squid.types.js";

/** Light catalog cache — 5 minutes max; no quote dedupe. */
const SQUID_CATALOG_CACHE_TTL_SECONDS = 300;
const ROUTE_STORE_TTL_SECONDS = 15 * 60;

export function squidChainsCacheKey(): string {
  return "defi:squid:catalog:chains";
}

export function squidTokensCacheKey(chainIds: string[]): string {
  const filtered = [...chainIds].sort();
  return `defi:squid:catalog:tokens:${filtered.join(",")}`;
}

export function squidRouteStoreKey(routeId: string): string {
  return `defi:squid:route:${routeId}`;
}

export async function squidCachedCatalogFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, SQUID_CATALOG_CACHE_TTL_SECONDS, fetcher);
}

/** Store a Squid route snapshot for execute-by-route_id (no quote dedupe). */
export async function storeSquidRoute(
  routeId: string,
  payload: SquidStoredRoutePayload,
): Promise<void> {
  await cacheSet(squidRouteStoreKey(routeId), payload, ROUTE_STORE_TTL_SECONDS);
}

export async function getStoredSquidRoute(routeId: string): Promise<SquidStoredRoutePayload | null> {
  return cacheGet<SquidStoredRoutePayload>(squidRouteStoreKey(routeId));
}
