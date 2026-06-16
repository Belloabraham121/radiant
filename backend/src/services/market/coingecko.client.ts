import { getCoingeckoConfig, isCoingeckoEnabled } from "../../config/coingecko.js";
import { tryConsumeTokenBucket } from "../../infrastructure/rate-limit/token-bucket.js";
import { cacheGet, cacheSet } from "../../infrastructure/redis/cache.js";

export type CoingeckoMarketRow = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
};

type CachedPrice = {
  usd: number;
  fetched_at: string;
};

type CachedLogo = {
  url: string;
  fetched_at: string;
};

let fetchImpl: typeof globalThis.fetch = (...args) => fetch(...args);

function cacheKeyPrice(id: string): string {
  return `market:coingecko:price:${id}`;
}

function cacheKeyLogo(id: string): string {
  return `market:coingecko:logo:${id}`;
}

async function coingeckoFetch(path: string, searchParams?: Record<string, string>): Promise<Response> {
  const config = getCoingeckoConfig();
  const url = new URL(`${config.baseUrl}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (config.apiKey) {
    headers[config.apiKeyHeader] = config.apiKey;
  }

  return fetchImpl(url.toString(), { headers });
}

async function fetchMarkets(ids: string[]): Promise<CoingeckoMarketRow[]> {
  if (ids.length === 0) return [];

  const config = getCoingeckoConfig();
  const allowed = await tryConsumeTokenBucket("coingecko:api", {
    capacity: config.rateLimitCapacity,
    refillIntervalMs: config.rateLimitRefillIntervalMs,
  });
  if (!allowed) {
    return [];
  }

  const response = await coingeckoFetch("/coins/markets", {
    vs_currency: "usd",
    ids: ids.join(","),
    order: "market_cap_desc",
    per_page: String(Math.min(ids.length, 250)),
    page: "1",
    sparkline: "false",
  });

  if (!response.ok) {
    throw new Error(`CoinGecko markets request failed (${response.status})`);
  }

  const payload = (await response.json()) as CoingeckoMarketRow[];
  return Array.isArray(payload) ? payload : [];
}

export async function getCachedUsdPrice(coinId: string): Promise<number | null> {
  const hit = await cacheGet<CachedPrice>(cacheKeyPrice(coinId));
  return hit?.usd ?? null;
}

export async function getCachedLogoUrl(coinId: string): Promise<string | null> {
  const hit = await cacheGet<CachedLogo>(cacheKeyLogo(coinId));
  return hit?.url ?? null;
}

export async function getStaleUsdPrice(coinId: string): Promise<number | null> {
  return getCachedUsdPrice(coinId);
}

/**
 * Resolve USD prices and logo URLs for CoinGecko ids.
 * Uses separate TTL caches; one markets call fills both when needed.
 */
export async function resolveCoingeckoMarketData(
  coinIds: string[],
): Promise<Map<string, { usdPrice: number | null; logoUrl: string | null }>> {
  const result = new Map<string, { usdPrice: number | null; logoUrl: string | null }>();
  if (!isCoingeckoEnabled() || coinIds.length === 0) {
    return result;
  }

  const config = getCoingeckoConfig();
  const uniqueIds = [...new Set(coinIds)];
  const idsNeedingFetch: string[] = [];

  for (const id of uniqueIds) {
    const [priceHit, logoHit] = await Promise.all([
      cacheGet<CachedPrice>(cacheKeyPrice(id)),
      cacheGet<CachedLogo>(cacheKeyLogo(id)),
    ]);

    const priceFresh =
      priceHit &&
      Date.now() - Date.parse(priceHit.fetched_at) < config.priceTtlSeconds * 1000;
    const logoFresh =
      logoHit &&
      Date.now() - Date.parse(logoHit.fetched_at) < config.logoTtlSeconds * 1000;

    if (priceFresh || logoFresh) {
      result.set(id, {
        usdPrice: priceHit?.usd ?? null,
        logoUrl: logoHit?.url ?? null,
      });
    }

    if (!priceFresh || !logoHit) {
      idsNeedingFetch.push(id);
    }
  }

  if (idsNeedingFetch.length === 0) {
    return result;
  }

  try {
    const markets = await fetchMarkets(idsNeedingFetch);
    const now = new Date().toISOString();

    for (const row of markets) {
      const usd =
        typeof row.current_price === "number" && Number.isFinite(row.current_price)
          ? row.current_price
          : null;
      const logo = row.image?.trim() ? row.image : null;

      if (usd !== null) {
        await cacheSet(cacheKeyPrice(row.id), { usd, fetched_at: now }, config.priceTtlSeconds);
      }
      if (logo) {
        await cacheSet(cacheKeyLogo(row.id), { url: logo, fetched_at: now }, config.logoTtlSeconds);
      }

      result.set(row.id, { usdPrice: usd, logoUrl: logo });
    }

    for (const id of idsNeedingFetch) {
      if (result.has(id)) continue;
      const stalePrice = await getStaleUsdPrice(id);
      const staleLogo = await getCachedLogoUrl(id);
      result.set(id, { usdPrice: stalePrice, logoUrl: staleLogo });
    }
  } catch {
    for (const id of idsNeedingFetch) {
      if (result.has(id)) continue;
      result.set(id, {
        usdPrice: await getStaleUsdPrice(id),
        logoUrl: await getCachedLogoUrl(id),
      });
    }
  }

  return result;
}

/** Test hooks */
export function setCoingeckoFetchForTests(fn: typeof fetchImpl | null): void {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

export function resetCoingeckoClientForTests(): void {
  fetchImpl = (...args) => fetch(...args);
}
