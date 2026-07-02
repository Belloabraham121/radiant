import { getCoingeckoConfig, isCoingeckoEnabled } from "../../../config/coingecko.js";
import { tryConsumeTokenBucket } from "../../../infrastructure/rate-limit/token-bucket.js";
import type { CoinGeckoChartPoint, CoinGeckoChartSnapshot } from "./cache/book-snapshot-cache.js";
import { getCoinGeckoChartSnapshot, setCoinGeckoChartSnapshot } from "./cache/book-snapshot-cache.js";

let fetchImpl: typeof globalThis.fetch = (...args) => fetch(...args);

const PAIR_TO_COIN_ID: Record<string, string> = {
  "BTC/USD": "bitcoin",
  "ETH/USD": "ethereum",
  "SOL/USD": "solana",
  "SUI/USD": "sui",
};

const INTERVAL_TO_DAYS: Record<string, string> = {
  "1h": "1",
  "4h": "7",
  "1d": "30",
  "1w": "90",
};

export function resolveCoinIdFromPair(pair: string): string | null {
  const normalized = pair.trim().toUpperCase();
  const direct = PAIR_TO_COIN_ID[normalized];
  if (direct) return direct;
  const base = normalized.split("/")[0]?.toLowerCase();
  return base && base.length > 0 ? base : null;
}

async function coingeckoChartFetch(coinId: string, days: string): Promise<CoinGeckoChartPoint[]> {
  const config = getCoingeckoConfig();
  const allowed = await tryConsumeTokenBucket("coingecko:api", {
    capacity: config.rateLimitCapacity,
    refillIntervalMs: config.rateLimitRefillIntervalMs,
  });
  if (!allowed) return [];

  const url = new URL(`${config.baseUrl}/coins/${encodeURIComponent(coinId)}/market_chart`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", days);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) {
    headers[config.apiKeyHeader] = config.apiKey;
  }

  const response = await fetchImpl(url.toString(), { headers });
  if (!response.ok) return [];

  const payload = (await response.json()) as { prices?: number[][] };
  const prices = Array.isArray(payload.prices) ? payload.prices : [];
  if (prices.length === 0) return [];

  const points: CoinGeckoChartPoint[] = [];
  for (let i = 0; i < prices.length; i++) {
    const row = prices[i];
    if (!row || row.length < 2) continue;
    const time = Math.floor(row[0]! / 1000);
    const close = row[1]!;
    const prevClose = i > 0 ? (prices[i - 1]?.[1] ?? close) : close;
    const open = prevClose;
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    points.push({ time, open, high, low, close });
  }
  return points;
}

export async function fetchCoinGeckoChartSnapshot(input: {
  coinId?: string;
  pair?: string;
  interval?: string;
}): Promise<CoinGeckoChartSnapshot | null> {
  if (!isCoingeckoEnabled()) return null;

  const coinId =
    input.coinId?.trim() ||
    (input.pair ? resolveCoinIdFromPair(input.pair) : null);
  if (!coinId) return null;

  const interval = input.interval?.trim() || "1d";
  const cached = await getCoinGeckoChartSnapshot(coinId, interval);
  if (cached) return cached;

  const days = INTERVAL_TO_DAYS[interval] ?? "30";
  const points = await coingeckoChartFetch(coinId, days);
  if (points.length === 0) return null;

  const snapshot: CoinGeckoChartSnapshot = {
    coin_id: coinId,
    interval,
    points,
    updated_at: new Date().toISOString(),
  };
  await setCoinGeckoChartSnapshot(snapshot);
  return snapshot;
}

/** Test hook */
export function setCoingeckoChartFetchForTests(fn: typeof fetchImpl | null): void {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

export function resetCoingeckoChartClientForTests(): void {
  fetchImpl = (...args) => fetch(...args);
}
