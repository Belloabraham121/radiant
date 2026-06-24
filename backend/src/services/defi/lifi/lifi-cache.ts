import { filterEnabledEvmChainIds } from "../../../config/supported-tokens.js";
import { getDefiCacheConfig } from "../../../config/defi-cache.js";
import { defiCachedFetch, hashQuoteParams } from "../cache.js";

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
): Promise<T> {
  return defiCachedFetch(
    lifiQuoteCacheKey(params),
    getDefiCacheConfig().quoteDedupeTtlSeconds,
    fetcher,
  );
}

export async function lifiCachedStatusFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().statusCacheTtlSeconds, fetcher);
}
