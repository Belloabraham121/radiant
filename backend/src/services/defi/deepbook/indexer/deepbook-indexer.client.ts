import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { cachedFetch } from "../../../infrastructure/redis/cache.js";
import type {
  IndexerAssetsResponse,
  IndexerHistoricalVolumeResponse,
  IndexerOhlcvResponse,
  IndexerOrderRecord,
  IndexerOrderUpdateRecord,
  IndexerOrderbookResponse,
  IndexerPoolRecord,
  IndexerStatusResponse,
  IndexerSummaryResponse,
  IndexerTickerResponse,
  IndexerTradeRecord,
} from "./indexer.types.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const TICKER_CACHE_TTL_SECONDS = 45;
const ORDERBOOK_L1_CACHE_TTL_SECONDS = 30;

export class IndexerRequestError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`DeepBook indexer ${path} failed: HTTP ${status}`);
    this.status = status;
  }
}

async function indexerFetch<T>(path: string, indexerUrl?: string): Promise<T> {
  const base = (indexerUrl ?? getDeepBookEnv().indexerUrl).replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    throw new AppError(502, "INDEXER_UNAVAILABLE", `DeepBook indexer unreachable: ${message}`, {
      path,
    });
  }

  if (!response.ok) {
    throw new IndexerRequestError(response.status, path);
  }

  const body = (await response.json()) as T;
  return body;
}

export async function fetchIndexerPools(
  indexerUrl?: string,
): Promise<IndexerPoolRecord[]> {
  const body = await indexerFetch<IndexerPoolRecord[]>("/get_pools", indexerUrl);
  if (!Array.isArray(body)) {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer /get_pools invalid");
  }
  return body;
}

export async function fetchIndexerTicker(
  indexerUrl?: string,
): Promise<IndexerTickerResponse> {
  const base = (indexerUrl ?? getDeepBookEnv().indexerUrl).replace(/\/$/, "");
  return cachedFetch(`deepbook:ticker:${base}`, TICKER_CACHE_TTL_SECONDS, async () => {
    const body = await indexerFetch<IndexerTickerResponse>("/ticker", indexerUrl);
    if (!body || typeof body !== "object") {
      throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer /ticker invalid");
    }
    return body;
  });
}

export async function fetchIndexerSummary(
  indexerUrl?: string,
): Promise<IndexerSummaryResponse> {
  const body = await indexerFetch<IndexerSummaryResponse>("/summary", indexerUrl);
  if (!body || typeof body !== "object") {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer /summary invalid");
  }
  return body;
}

export async function fetchIndexerAssets(
  indexerUrl?: string,
): Promise<IndexerAssetsResponse> {
  const body = await indexerFetch<IndexerAssetsResponse>("/assets", indexerUrl);
  if (!body || typeof body !== "object") {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer /assets invalid");
  }
  return body;
}

export async function fetchIndexerOrderbook(
  poolName: string,
  options?: { level?: 1 | 2; depth?: number },
  indexerUrl?: string,
): Promise<IndexerOrderbookResponse> {
  const level = options?.level ?? 1;
  const depth = options?.depth;
  const base = (indexerUrl ?? getDeepBookEnv().indexerUrl).replace(/\/$/, "");
  const cacheKey = `deepbook:orderbook:${base}:${poolName.toUpperCase()}:L${level}:${depth ?? "all"}`;

  if (level === 1 && depth === undefined) {
    return cachedFetch(cacheKey, ORDERBOOK_L1_CACHE_TTL_SECONDS, async () =>
      fetchIndexerOrderbookUncached(poolName, options, indexerUrl),
    );
  }

  return fetchIndexerOrderbookUncached(poolName, options, indexerUrl);
}

async function fetchIndexerOrderbookUncached(
  poolName: string,
  options?: { level?: 1 | 2; depth?: number },
  indexerUrl?: string,
): Promise<IndexerOrderbookResponse> {
  const params = new URLSearchParams();
  if (options?.level !== undefined) {
    params.set("level", String(options.level));
  }
  if (options?.depth !== undefined) {
    params.set("depth", String(options.depth));
  }

  const query = params.toString();
  const path = `/orderbook/${encodeURIComponent(poolName)}${query.length > 0 ? `?${query}` : ""}`;
  const body = await indexerFetch<IndexerOrderbookResponse>(path, indexerUrl);

  if (!body || !Array.isArray(body.bids) || !Array.isArray(body.asks)) {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer orderbook invalid");
  }

  return body;
}

export async function fetchIndexerOrders(
  poolName: string,
  balanceManagerId: string,
  options?: { limit?: number; status?: string },
  indexerUrl?: string,
): Promise<IndexerOrderRecord[]> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.status) {
    params.set("status", options.status);
  }

  const query = params.toString();
  const path =
    `/orders/${encodeURIComponent(poolName)}/${encodeURIComponent(balanceManagerId)}` +
    (query.length > 0 ? `?${query}` : "");

  try {
    const body = await indexerFetch<IndexerOrderRecord[]>(path, indexerUrl);
    return Array.isArray(body) ? body : [];
  } catch (err) {
    if (err instanceof IndexerRequestError && (err.status === 404 || err.status === 400)) {
      return [];
    }
    throw err;
  }
}

export async function fetchIndexerOrderUpdates(
  poolName: string,
  options?: {
    limit?: number;
    start_time?: number;
    end_time?: number;
    status?: string;
    balance_manager_id?: string;
  },
  indexerUrl?: string,
): Promise<IndexerOrderUpdateRecord[]> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.start_time !== undefined) {
    params.set("start_time", String(options.start_time));
  }
  if (options?.end_time !== undefined) {
    params.set("end_time", String(options.end_time));
  }
  if (options?.status) {
    params.set("status", options.status);
  }
  if (options?.balance_manager_id) {
    params.set("balance_manager_id", options.balance_manager_id);
  }

  const query = params.toString();
  const path =
    `/order_updates/${encodeURIComponent(poolName)}` + (query.length > 0 ? `?${query}` : "");

  try {
    const body = await indexerFetch<IndexerOrderUpdateRecord[]>(path, indexerUrl);
    return Array.isArray(body) ? body : [];
  } catch (err) {
    if (err instanceof IndexerRequestError && (err.status === 404 || err.status === 400)) {
      return [];
    }
    throw err;
  }
}

export async function fetchIndexerStatus(
  indexerUrl?: string,
): Promise<IndexerStatusResponse> {
  const body = await indexerFetch<IndexerStatusResponse>("/status", indexerUrl);
  if (!body || typeof body.status !== "string") {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer /status invalid");
  }
  return body;
}

export async function fetchIndexerTrades(
  poolName: string,
  options?: { limit?: number; start_time?: number; end_time?: number },
  indexerUrl?: string,
): Promise<IndexerTradeRecord[]> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.start_time !== undefined) {
    params.set("start_time", String(options.start_time));
  }
  if (options?.end_time !== undefined) {
    params.set("end_time", String(options.end_time));
  }

  const query = params.toString();
  const path = `/trades/${encodeURIComponent(poolName)}${query.length > 0 ? `?${query}` : ""}`;

  try {
    const body = await indexerFetch<IndexerTradeRecord[]>(path, indexerUrl);
    return Array.isArray(body) ? body : [];
  } catch (err) {
    if (err instanceof IndexerRequestError && (err.status === 404 || err.status === 400)) {
      return [];
    }
    throw err;
  }
}

export async function fetchIndexerHistoricalVolume(
  poolName: string,
  indexerUrl?: string,
): Promise<IndexerHistoricalVolumeResponse> {
  const path = `/historical_volume/${encodeURIComponent(poolName)}`;
  const body = await indexerFetch<IndexerHistoricalVolumeResponse>(path, indexerUrl);
  if (!body || typeof body !== "object") {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer historical_volume invalid");
  }
  return body;
}

export async function fetchIndexerAllHistoricalVolume(
  indexerUrl?: string,
): Promise<IndexerHistoricalVolumeResponse> {
  const body = await indexerFetch<IndexerHistoricalVolumeResponse>("/all_historical_volume", indexerUrl);
  if (!body || typeof body !== "object") {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer all_historical_volume invalid");
  }
  return body;
}

export async function fetchIndexerHistoricalVolumeByManager(
  balanceManagerId: string,
  indexerUrl?: string,
): Promise<IndexerHistoricalVolumeResponse> {
  const path = `/historical_volume_by_balance_manager_id/${encodeURIComponent(balanceManagerId)}`;
  try {
    const body = await indexerFetch<IndexerHistoricalVolumeResponse>(path, indexerUrl);
    return body && typeof body === "object" ? body : {};
  } catch (err) {
    if (err instanceof IndexerRequestError && (err.status === 404 || err.status === 400)) {
      return {};
    }
    throw err;
  }
}

export async function fetchIndexerHistoricalVolumeByManagerInterval(
  balanceManagerId: string,
  options?: { interval?: string; limit?: number },
  indexerUrl?: string,
): Promise<IndexerHistoricalVolumeResponse> {
  const params = new URLSearchParams();
  if (options?.interval) {
    params.set("interval", options.interval);
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  const path =
    `/historical_volume_by_balance_manager_id_with_interval/${encodeURIComponent(balanceManagerId)}` +
    (query.length > 0 ? `?${query}` : "");

  try {
    const body = await indexerFetch<IndexerHistoricalVolumeResponse>(path, indexerUrl);
    return body && typeof body === "object" ? body : {};
  } catch (err) {
    if (err instanceof IndexerRequestError && (err.status === 404 || err.status === 400)) {
      return {};
    }
    throw err;
  }
}

export async function fetchIndexerOhlcv(
  poolName: string,
  options?: { interval?: string; limit?: number },
  indexerUrl?: string,
): Promise<IndexerOhlcvResponse> {
  const params = new URLSearchParams();
  if (options?.interval) {
    params.set("interval", options.interval);
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  const path = `/ohclv/${encodeURIComponent(poolName)}${query.length > 0 ? `?${query}` : ""}`;
  const body = await indexerFetch<IndexerOhlcvResponse>(path, indexerUrl);

  if (!body || !Array.isArray(body.candles)) {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer ohclv invalid");
  }

  return body;
}
