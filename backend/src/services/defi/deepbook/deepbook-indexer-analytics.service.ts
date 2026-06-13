import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { ensureBalanceManager } from "./deepbook-balance-manager.service.js";
import {
  fetchIndexerAllHistoricalVolume,
  fetchIndexerHistoricalVolume,
  fetchIndexerHistoricalVolumeByManager,
  fetchIndexerHistoricalVolumeByManagerInterval,
  fetchIndexerOhlcv,
  fetchIndexerPools,
  fetchIndexerStatus,
  fetchIndexerSummary,
  fetchIndexerTicker,
  fetchIndexerTrades,
  IndexerRequestError,
} from "./indexer/deepbook-indexer.client.js";
import {
  findPoolByKey,
  normalizeHistoricalVolumeAtomic,
  normalizeOhlcvCandle,
  normalizeSummaryEntry,
  normalizeTickerEntry,
  normalizeTradeRecord,
  type NormalizedOhlcvCandle,
  type NormalizedTrade,
} from "./indexer/normalize.js";
import { normalizePoolKey } from "./pool-key.js";

const DEFAULT_TRADE_LIMIT = 50;
const MAX_TRADE_LIMIT = 200;
const DEFAULT_OHLCV_LIMIT = 48;
const MAX_OHLCV_LIMIT = 500;

export type DeepBookTradesResult = {
  pool_key: string;
  trades: NormalizedTrade[];
  count: number;
  start_time?: number;
  end_time?: number;
  source: "indexer";
};

export type DeepBookVolumeResult = {
  pool_key: string | null;
  quote_coin: string | null;
  base_coin: string | null;
  quote_volume_24h: number | null;
  base_volume_24h: number | null;
  quote_volume_all_time: number | null;
  quote_volume_range: number | null;
  base_volume_range: number | null;
  start_time?: number;
  end_time?: number;
  scope: "pool" | "manager" | "all_pools";
  manager_object_id?: string;
  pools_count?: number;
  manager_pools?: Array<{ pool_key: string; quote_volume_atomic: number }>;
  source: "indexer";
};

export type DeepBookOhlcvResult = {
  pool_key: string;
  interval: string;
  candles: NormalizedOhlcvCandle[];
  source: "indexer";
};

export type DeepBookIndexerStatusResult = {
  status: string;
  latest_onchain_checkpoint: number;
  max_lag_pipeline: string;
  max_checkpoint_lag: number;
  max_time_lag_seconds: number;
  source: "indexer";
};

function parsePoolKeyParam(params: Record<string, unknown>): string {
  const raw = params.pool_key ?? params.pool ?? getDeepBookEnv().defaultPool;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.pool_key is required.");
  }
  return normalizePoolKey(raw);
}

function parseLimit(params: Record<string, unknown>, fallback: number, max: number): number {
  const raw = params.limit;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.trunc(raw), max);
  }
  return fallback;
}

function parseTimestamp(params: Record<string, unknown>, key: string): number | undefined {
  const raw = params[key];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  return undefined;
}

async function resolvePool(poolKey: string) {
  const pools = await fetchIndexerPools();
  const pool = findPoolByKey(pools, poolKey);
  if (!pool) {
    throw new AppError(404, "POOL_NOT_FOUND", `DeepBook pool not found: ${poolKey}`);
  }
  return pool;
}

export async function getDeepBookTrades(
  params: Record<string, unknown>,
): Promise<DeepBookTradesResult> {
  const poolKey = parsePoolKeyParam(params);
  await resolvePool(poolKey);

  const trades = await fetchIndexerTrades(poolKey, {
    limit: parseLimit(params, DEFAULT_TRADE_LIMIT, MAX_TRADE_LIMIT),
    start_time: parseTimestamp(params, "start_time"),
    end_time: parseTimestamp(params, "end_time"),
  });

  return {
    pool_key: poolKey,
    trades: trades.map((trade) => normalizeTradeRecord(poolKey, trade)),
    count: trades.length,
    ...(parseTimestamp(params, "start_time") !== undefined
      ? { start_time: parseTimestamp(params, "start_time") }
      : {}),
    ...(parseTimestamp(params, "end_time") !== undefined
      ? { end_time: parseTimestamp(params, "end_time") }
      : {}),
    source: "indexer",
  };
}

export async function getDeepBookVolume(
  privyUserId: string | undefined,
  params: Record<string, unknown>,
): Promise<DeepBookVolumeResult> {
  const scope =
    params.scope === "manager" || params.for_manager === true
      ? "manager"
      : params.scope === "all_pools" || params.all_pools === true
        ? "all_pools"
        : "pool";

  const startTime = parseTimestamp(params, "start_time");
  const endTime = parseTimestamp(params, "end_time");

  if (scope === "all_pools") {
    const allVolume = await fetchIndexerAllHistoricalVolume();
    return {
      pool_key: null,
      quote_coin: null,
      base_coin: null,
      quote_volume_24h: null,
      base_volume_24h: null,
      quote_volume_all_time: null,
      quote_volume_range: null,
      base_volume_range: null,
      scope: "all_pools",
      pools_count: Object.keys(allVolume).length,
      source: "indexer",
    };
  }

  if (scope === "manager") {
    if (!privyUserId) {
      throw new AppError(401, "UNAUTHORIZED", "Manager volume requires an authenticated session.");
    }
    const manager = await ensureBalanceManager(privyUserId);
    const interval = typeof params.interval === "string" ? params.interval : undefined;

    const volumeRaw = interval
      ? await fetchIndexerHistoricalVolumeByManagerInterval(manager.manager_object_id, {
          interval,
          limit: parseLimit(params, 30, 365),
        })
      : await fetchIndexerHistoricalVolumeByManager(manager.manager_object_id);

    const entries = Object.entries(volumeRaw).map(([poolName, atomic]) => {
      const poolKey = normalizePoolKey(poolName);
      return { pool_key: poolKey, quote_volume_atomic: atomic };
    });

    return {
      pool_key: null,
      quote_coin: null,
      base_coin: null,
      quote_volume_24h: null,
      base_volume_24h: null,
      quote_volume_all_time: null,
      quote_volume_range: null,
      base_volume_range: null,
      scope: "manager",
      manager_object_id: manager.manager_object_id,
      manager_pools: entries,
      source: "indexer",
    };
  }

  const poolKey = parsePoolKeyParam(params);
  const pool = await resolvePool(poolKey);

  let quoteVolume24h: number | null = null;
  let baseVolume24h: number | null = null;
  try {
    const [tickerRaw, summaryRaw] = await Promise.all([
      fetchIndexerTicker(),
      fetchIndexerSummary(),
    ]);
    const tickerEntry = tickerRaw[pool.pool_name];
    if (tickerEntry) {
      const ticker = normalizeTickerEntry(pool.pool_name, tickerEntry, pool);
      quoteVolume24h = ticker.quote_volume_24h;
      baseVolume24h = ticker.base_volume_24h;
    } else {
      const summaryEntry = summaryRaw[pool.pool_name];
      if (summaryEntry) {
        const summary = normalizeSummaryEntry(pool.pool_name, summaryEntry);
        quoteVolume24h = summary.quote_volume_24h;
        baseVolume24h = summary.base_volume_24h;
      }
    }
  } catch {
    quoteVolume24h = null;
    baseVolume24h = null;
  }

  const historical = await fetchIndexerHistoricalVolume(poolKey);
  const atomicEntry = historical[pool.pool_name] ?? Object.values(historical)[0] ?? 0;
  const allTime = normalizeHistoricalVolumeAtomic(pool.pool_name, atomicEntry, pool);

  let quoteVolumeRange: number | null = null;
  let baseVolumeRange: number | null = null;
  if (startTime !== undefined || endTime !== undefined) {
    const trades = await fetchIndexerTrades(poolKey, {
      limit: MAX_TRADE_LIMIT,
      start_time: startTime,
      end_time: endTime,
    });
    quoteVolumeRange = trades.reduce((sum, trade) => sum + trade.quote_volume, 0);
    baseVolumeRange = trades.reduce((sum, trade) => sum + trade.base_volume, 0);
  }

  return {
    pool_key: poolKey,
    quote_coin: pool.quote_asset_symbol,
    base_coin: pool.base_asset_symbol,
    quote_volume_24h: quoteVolume24h,
    base_volume_24h: baseVolume24h,
    quote_volume_all_time: allTime.quote_volume,
    quote_volume_range: quoteVolumeRange,
    base_volume_range: baseVolumeRange,
    ...(startTime !== undefined ? { start_time: startTime } : {}),
    ...(endTime !== undefined ? { end_time: endTime } : {}),
    scope: "pool",
    source: "indexer",
  };
}

export async function getDeepBookOhlcv(
  params: Record<string, unknown>,
): Promise<DeepBookOhlcvResult> {
  const poolKey = parsePoolKeyParam(params);
  await resolvePool(poolKey);

  const interval = typeof params.interval === "string" && params.interval.length > 0
    ? params.interval
    : "1h";

  const body = await fetchIndexerOhlcv(poolKey, {
    interval,
    limit: parseLimit(params, DEFAULT_OHLCV_LIMIT, MAX_OHLCV_LIMIT),
  });

  return {
    pool_key: poolKey,
    interval,
    candles: body.candles.map(normalizeOhlcvCandle),
    source: "indexer",
  };
}

export async function getDeepBookIndexerStatus(): Promise<DeepBookIndexerStatusResult> {
  const status = await fetchIndexerStatus();
  const maxLag = status.pipelines.reduce(
    (max, pipeline) => Math.max(max, pipeline.checkpoint_lag),
    0,
  );
  const maxTimeLag = status.pipelines.reduce(
    (max, pipeline) => Math.max(max, pipeline.time_lag_seconds),
    0,
  );

  return {
    status: status.status,
    latest_onchain_checkpoint: status.latest_onchain_checkpoint,
    max_lag_pipeline: status.max_lag_pipeline,
    max_checkpoint_lag: maxLag,
    max_time_lag_seconds: maxTimeLag,
    source: "indexer",
  };
}

export async function safeGetDeepBookIndexerStatus(): Promise<DeepBookIndexerStatusResult | null> {
  try {
    return await getDeepBookIndexerStatus();
  } catch (err) {
    if (err instanceof IndexerRequestError) {
      return null;
    }
    throw err;
  }
}
