import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import type {
  IndexerAssetsResponse,
  IndexerOrderRecord,
  IndexerOrderUpdateRecord,
  IndexerOrderbookResponse,
  IndexerPoolRecord,
  IndexerSummaryResponse,
  IndexerTickerResponse,
} from "./indexer.types.js";

const DEFAULT_TIMEOUT_MS = 15_000;

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
  const body = await indexerFetch<IndexerTickerResponse>("/ticker", indexerUrl);
  if (!body || typeof body !== "object") {
    throw new AppError(502, "INDEXER_INVALID_RESPONSE", "DeepBook indexer /ticker invalid");
  }
  return body;
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
