import { cacheGet, cacheSet } from "../../../../infrastructure/redis/cache.js";
import { getCoingeckoConfig } from "../../../../config/coingecko.js";
import type { PolymarketBookSnapshot } from "../../adapters/polymarket/polymarket.types.js";
import { pmBookSnapshotKey } from "../normalize/stream-keys.js";

const memorySnapshots = new Map<string, PolymarketBookSnapshot>();

const BOOK_SNAPSHOT_TTL_SECONDS = 5;

export async function setBookSnapshot(snapshot: PolymarketBookSnapshot): Promise<void> {
  memorySnapshots.set(snapshot.asset_id, snapshot);
  await cacheSet(pmBookSnapshotKey(snapshot.asset_id), snapshot, BOOK_SNAPSHOT_TTL_SECONDS);
}

export async function getBookSnapshot(assetId: string): Promise<PolymarketBookSnapshot | null> {
  const cached = await cacheGet<PolymarketBookSnapshot>(pmBookSnapshotKey(assetId));
  if (cached) return cached;
  return memorySnapshots.get(assetId) ?? null;
}

export type CoinGeckoChartPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type CoinGeckoChartSnapshot = {
  coin_id: string;
  interval: string;
  points: CoinGeckoChartPoint[];
  updated_at: string;
};

export async function setCoinGeckoChartSnapshot(snapshot: CoinGeckoChartSnapshot): Promise<void> {
  const config = getCoingeckoConfig();
  const { cgChartCacheKey } = await import("../normalize/stream-keys.js");
  await cacheSet(cgChartCacheKey(snapshot.coin_id, snapshot.interval), snapshot, config.priceTtlSeconds);
}

export async function getCoinGeckoChartSnapshot(
  coinId: string,
  interval: string,
): Promise<CoinGeckoChartSnapshot | null> {
  const { cgChartCacheKey } = await import("../normalize/stream-keys.js");
  return cacheGet<CoinGeckoChartSnapshot>(cgChartCacheKey(coinId, interval));
}

/** Test hook */
export function clearBookSnapshotsForTests(): void {
  memorySnapshots.clear();
}
