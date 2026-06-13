import { getDeepBookEnv } from "../../config/deepbook.js";
import { AppError } from "../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import { getDeepBookClient } from "./providers/sui-deepbook.provider.js";
import {
  fetchIndexerOrderbook,
  fetchIndexerPools,
  fetchIndexerSummary,
  fetchIndexerTicker,
  IndexerRequestError,
} from "./indexer/deepbook-indexer.client.js";
import {
  findPoolByKey,
  normalizePoolRecord,
  normalizeSummaryEntry,
  normalizeTickerEntry,
  toPoolSummary,
  type NormalizedPool,
  type NormalizedSummary,
  type NormalizedTicker,
} from "./indexer/normalize.js";
import type { IndexerOrderbookResponse, IndexerPoolRecord } from "./indexer/indexer.types.js";
import { normalizePoolKey } from "./pool-key.js";
import type { PoolSummary } from "./types.js";

export type DeepBookPoolInfo = NormalizedPool & {
  ticker: NormalizedTicker | null;
  on_chain: {
    taker_fee: number;
    maker_fee: number;
    stake_required: number;
    tick_size: number;
    lot_size: number;
    min_size: number;
  } | null;
};

export type DeepBookPoolsList = {
  pools: PoolSummary[];
  default_pool: string;
  source: "indexer";
};

export type DeepBookTickerMap = {
  tickers: NormalizedTicker[];
  source: "indexer";
};

let fetchPoolsFn = fetchIndexerPools;
let fetchTickerFn = fetchIndexerTicker;
let fetchSummaryFn = fetchIndexerSummary;
let fetchOrderbookFn = fetchIndexerOrderbook;

async function loadPoolsWithTicker(): Promise<{
  pools: IndexerPoolRecord[];
  tickers: Record<string, NormalizedTicker>;
}> {
  const [pools, tickerRaw] = await Promise.all([fetchPoolsFn(), fetchTickerFn()]);
  const tickers: Record<string, NormalizedTicker> = {};

  for (const [poolKey, entry] of Object.entries(tickerRaw)) {
    const pool = findPoolByKey(pools, poolKey);
    tickers[poolKey] = normalizeTickerEntry(poolKey, entry, pool);
  }

  return { pools, tickers };
}

export async function listDeepBookPools(): Promise<DeepBookPoolsList> {
  try {
    const { pools, tickers } = await loadPoolsWithTicker();
    const { defaultPool } = getDeepBookEnv();

    const summaries = pools.map((pool) => {
      const normalized = normalizePoolRecord(pool);
      return toPoolSummary(normalized, tickers[pool.pool_name] ?? null);
    });

    summaries.sort((a, b) => {
      if (a.pool_key === defaultPool) return -1;
      if (b.pool_key === defaultPool) return 1;
      return a.pool_key.localeCompare(b.pool_key);
    });

    return { pools: summaries, default_pool: defaultPool, source: "indexer" };
  } catch (err) {
    if (err instanceof IndexerRequestError && err.status === 404) {
      return { pools: [], default_pool: getDeepBookEnv().defaultPool, source: "indexer" };
    }
    throw err;
  }
}

export async function getDeepBookTicker(): Promise<DeepBookTickerMap> {
  try {
    const { pools, tickers } = await loadPoolsWithTicker();
    void pools;
    const list = Object.values(tickers).sort((a, b) => a.pool_key.localeCompare(b.pool_key));
    return { tickers: list, source: "indexer" };
  } catch (err) {
    if (err instanceof IndexerRequestError) {
      return { tickers: [], source: "indexer" };
    }
    throw err;
  }
}

export async function getDeepBookPoolInfo(
  poolKey: string,
  privyUserId?: string,
): Promise<DeepBookPoolInfo> {
  const normalizedKey = normalizePoolKey(poolKey);
  const pools = await fetchPoolsFn();
  const pool = findPoolByKey(pools, normalizedKey);
  if (!pool) {
    const available = pools.map((p) => p.pool_name).sort().join(", ");
    throw new AppError(
      404,
      "POOL_NOT_FOUND",
      `DeepBook pool not found: ${poolKey}. Available pools: ${available}`,
    );
  }

  let ticker: NormalizedTicker | null = null;
  try {
    const tickerRaw = await fetchTickerFn();
    const entry = tickerRaw[pool.pool_name];
    if (entry) {
      ticker = normalizeTickerEntry(pool.pool_name, entry, pool);
    }
  } catch {
    ticker = null;
  }

  const normalized = normalizePoolRecord(pool);
  let onChain: DeepBookPoolInfo["on_chain"] = null;

  if (privyUserId) {
    const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
    if (wallet) {
      try {
        const client = getDeepBookClient({ address: wallet.address });
        const [tradeParams, bookParams] = await Promise.all([
          client.poolTradeParams(pool.pool_name),
          client.poolBookParams(pool.pool_name),
        ]);
        onChain = {
          taker_fee: Number(tradeParams.takerFee),
          maker_fee: Number(tradeParams.makerFee),
          stake_required: Number(tradeParams.stakeRequired),
          tick_size: Number(bookParams.tickSize),
          lot_size: Number(bookParams.lotSize),
          min_size: Number(bookParams.minSize),
        };
      } catch {
        onChain = null;
      }
    }
  }

  return {
    ...normalized,
    ticker,
    on_chain: onChain,
  };
}

export async function getDeepBookPoolSummaryMap(): Promise<Record<string, NormalizedSummary>> {
  const summaryRaw = await fetchSummaryFn();
  const result: Record<string, NormalizedSummary> = {};
  for (const [key, entry] of Object.entries(summaryRaw)) {
    result[key] = normalizeSummaryEntry(key, entry);
  }
  return result;
}

export async function getDeepBookOrderbook(
  poolName: string,
  options?: { level?: 1 | 2; depth?: number },
): Promise<IndexerOrderbookResponse & { pool_key: string }> {
  try {
    const book = await fetchOrderbookFn(poolName, options);
    return { ...book, pool_key: poolName.toUpperCase() };
  } catch (err) {
    if (err instanceof IndexerRequestError && err.status === 404) {
      throw new AppError(404, "POOL_NOT_FOUND", `DeepBook orderbook not found: ${poolName}`);
    }
    throw err;
  }
}

export function setDeepBookIndexerFnsForTests(input: {
  fetchPools?: typeof fetchIndexerPools;
  fetchTicker?: typeof fetchIndexerTicker;
  fetchSummary?: typeof fetchIndexerSummary;
  fetchOrderbook?: typeof fetchIndexerOrderbook;
}): void {
  if (input.fetchPools) fetchPoolsFn = input.fetchPools;
  if (input.fetchTicker) fetchTickerFn = input.fetchTicker;
  if (input.fetchSummary) fetchSummaryFn = input.fetchSummary;
  if (input.fetchOrderbook) fetchOrderbookFn = input.fetchOrderbook;
}

export function resetDeepBookPoolsServiceForTests(): void {
  fetchPoolsFn = fetchIndexerPools;
  fetchTickerFn = fetchIndexerTicker;
  fetchSummaryFn = fetchIndexerSummary;
  fetchOrderbookFn = fetchIndexerOrderbook;
}
