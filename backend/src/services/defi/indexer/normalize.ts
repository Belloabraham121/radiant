import { atomicToDisplay } from "../asset-scalars.js";
import type {
  IndexerPoolRecord,
  IndexerSummaryRecord,
  IndexerTickerRecord,
} from "./indexer.types.js";
import type { PoolSummary } from "../types.js";

export type NormalizedPool = {
  pool_key: string;
  pool_id: string;
  base_coin: string;
  quote_coin: string;
  base_asset_name: string;
  quote_asset_name: string;
  min_size: number;
  min_size_display: number;
  lot_size: number;
  lot_size_display: number;
  tick_size: number;
  tick_size_display: number;
};

export type NormalizedTicker = {
  pool_key: string;
  last_price: number;
  base_volume_24h: number;
  quote_volume_24h: number;
  is_frozen: boolean;
};

export type NormalizedSummary = {
  pool_key: string;
  base_currency: string;
  quote_currency: string;
  last_price: number;
  lowest_price_24h: number;
  highest_price_24h: number;
  price_change_percent_24h: number;
  base_volume_24h: number;
  quote_volume_24h: number;
  highest_bid: number;
  lowest_ask: number;
};

export function normalizePoolRecord(pool: IndexerPoolRecord): NormalizedPool {
  return {
    pool_key: pool.pool_name,
    pool_id: pool.pool_id,
    base_coin: pool.base_asset_symbol,
    quote_coin: pool.quote_asset_symbol,
    base_asset_name: pool.base_asset_name,
    quote_asset_name: pool.quote_asset_name,
    min_size: pool.min_size,
    min_size_display: atomicToDisplay(BigInt(pool.min_size), pool.base_asset_decimals),
    lot_size: pool.lot_size,
    lot_size_display: atomicToDisplay(BigInt(pool.lot_size), pool.base_asset_decimals),
    tick_size: pool.tick_size,
    tick_size_display: atomicToDisplay(BigInt(pool.tick_size), pool.quote_asset_decimals),
  };
}

export function normalizeTickerEntry(
  poolKey: string,
  ticker: IndexerTickerRecord,
  pool?: IndexerPoolRecord,
): NormalizedTicker {
  const baseDecimals = pool?.base_asset_decimals ?? 9;
  const quoteDecimals = pool?.quote_asset_decimals ?? 6;

  return {
    pool_key: poolKey,
    last_price: ticker.last_price,
    base_volume_24h: ticker.base_volume,
    quote_volume_24h: ticker.quote_volume,
    is_frozen: ticker.isFrozen === 1,
  };
}

export function normalizeSummaryEntry(
  poolKey: string,
  summary: IndexerSummaryRecord,
): NormalizedSummary {
  return {
    pool_key: poolKey,
    base_currency: summary.base_currency,
    quote_currency: summary.quote_currency,
    last_price: summary.last_price,
    lowest_price_24h: summary.lowest_price_24h,
    highest_price_24h: summary.highest_price_24h,
    price_change_percent_24h: summary.price_change_percent_24h,
    base_volume_24h: summary.base_volume,
    quote_volume_24h: summary.quote_volume,
    highest_bid: summary.highest_bid,
    lowest_ask: summary.lowest_ask,
  };
}

export function toPoolSummary(pool: NormalizedPool, ticker?: NormalizedTicker): PoolSummary {
  return {
    pool_key: pool.pool_key,
    base_coin: pool.base_coin,
    quote_coin: pool.quote_coin,
    last_price: ticker?.last_price ?? null,
    volume_24h: ticker?.quote_volume_24h ?? null,
  };
}

export function findPoolByKey(
  pools: IndexerPoolRecord[],
  poolKey: string,
): IndexerPoolRecord | undefined {
  const normalized = poolKey.toUpperCase();
  return pools.find((pool) => pool.pool_name.toUpperCase() === normalized);
}

export function summaryKeyToPoolKey(key: string): string {
  return key.toUpperCase();
}
