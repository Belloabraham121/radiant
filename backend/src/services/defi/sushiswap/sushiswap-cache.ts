import { getDefiCacheConfig } from "../../../config/defi-cache.js";
import { defiCachedFetch, hashQuoteParams } from "../cache.js";

export function sushiSupportedChainsCacheKey(): string {
  return "defi:sushiswap:catalog:chains";
}

export function sushiTokenMetaCacheKey(chainId: number, tokenAddress: string): string {
  return `defi:sushiswap:token:${chainId}:${tokenAddress.toLowerCase()}`;
}

export function sushiPriceCacheKey(chainId: number, tokenAddresses: string[]): string {
  const sorted = [...tokenAddresses].map((a) => a.toLowerCase()).sort();
  return `defi:sushiswap:price:${chainId}:${sorted.join(",")}`;
}

export function sushiQuoteCacheKey(chainId: number, params: Record<string, unknown>): string {
  return `defi:sushiswap:quote:${chainId}:${hashQuoteParams(params)}`;
}

/** Phase 3 — wrap SushiSwap HTTP reads. */
export async function sushiCachedCatalogFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().catalogCacheTtlSeconds, fetcher);
}

export async function sushiCachedTokenMetaFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().tokenMetaCacheTtlSeconds, fetcher);
}

export async function sushiCachedPriceFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(key, getDefiCacheConfig().priceCacheTtlSeconds, fetcher);
}

export async function sushiCachedQuoteFetch<T>(
  chainId: number,
  params: Record<string, unknown>,
  fetcher: () => Promise<T>,
): Promise<T> {
  return defiCachedFetch(
    sushiQuoteCacheKey(chainId, params),
    getDefiCacheConfig().quoteDedupeTtlSeconds,
    fetcher,
  );
}
