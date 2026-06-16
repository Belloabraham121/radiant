import { getDeepBookEnv } from "../../../../config/deepbook.js";
import { AppError } from "../../../../errors/app-error.js";
import { IndexerRequestError } from "./deepbook-indexer.client.js";
import type {
  MarginIndexerCollateralRecord,
  MarginIndexerLiquidationRecord,
  MarginIndexerLoanBorrowedRecord,
  MarginIndexerLoanRepaidRecord,
  MarginIndexerManagerStateRecord,
  MarginIndexerManagersInfoRecord,
  MarginIndexerQueryOptions,
} from "./margin-indexer.types.js";

const DEFAULT_TIMEOUT_MS = 15_000;

async function marginIndexerFetch<T>(path: string, indexerUrl?: string): Promise<T> {
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
    throw new AppError(502, "INDEXER_UNAVAILABLE", `DeepBook margin indexer unreachable: ${message}`, {
      path,
    });
  }

  if (!response.ok) {
    throw new IndexerRequestError(response.status, path);
  }

  return (await response.json()) as T;
}

function buildMarginIndexerPath(
  endpoint: string,
  options: MarginIndexerQueryOptions = {},
): string {
  const params = new URLSearchParams();
  if (options.start_time != null) {
    params.set("start_time", String(options.start_time));
  }
  if (options.end_time != null) {
    params.set("end_time", String(options.end_time));
  }
  if (options.limit != null) {
    params.set("limit", String(options.limit));
  }
  if (options.margin_manager_id) {
    params.set("margin_manager_id", options.margin_manager_id);
  }
  if (options.margin_pool_id) {
    params.set("margin_pool_id", options.margin_pool_id);
  }
  if (options.deepbook_pool_id) {
    params.set("deepbook_pool_id", options.deepbook_pool_id);
  }
  if (options.max_risk_ratio != null) {
    params.set("max_risk_ratio", String(options.max_risk_ratio));
  }
  if (options.supplier) {
    params.set("supplier", options.supplier);
  }
  if (options.type) {
    params.set("type", options.type);
  }
  if (options.is_base != null) {
    params.set("is_base", String(options.is_base));
  }

  const query = params.toString();
  return query.length > 0 ? `${endpoint}?${query}` : endpoint;
}

async function fetchMarginIndexerArray<T>(
  endpoint: string,
  options?: MarginIndexerQueryOptions,
  indexerUrl?: string,
): Promise<T[]> {
  const path = buildMarginIndexerPath(endpoint, options);
  try {
    const body = await marginIndexerFetch<T[]>(path, indexerUrl);
    return Array.isArray(body) ? body : [];
  } catch (err) {
    if (err instanceof IndexerRequestError && (err.status === 404 || err.status === 400)) {
      return [];
    }
    throw err;
  }
}

export async function fetchMarginIndexerLiquidations(
  options?: MarginIndexerQueryOptions,
  indexerUrl?: string,
): Promise<MarginIndexerLiquidationRecord[]> {
  return fetchMarginIndexerArray<MarginIndexerLiquidationRecord>("/liquidation", options, indexerUrl);
}

export async function fetchMarginIndexerCollateralEvents(
  options?: MarginIndexerQueryOptions,
  indexerUrl?: string,
): Promise<MarginIndexerCollateralRecord[]> {
  return fetchMarginIndexerArray<MarginIndexerCollateralRecord>(
    "/collateral_events",
    options,
    indexerUrl,
  );
}

export async function fetchMarginIndexerLoanBorrowed(
  options?: MarginIndexerQueryOptions,
  indexerUrl?: string,
): Promise<MarginIndexerLoanBorrowedRecord[]> {
  return fetchMarginIndexerArray<MarginIndexerLoanBorrowedRecord>(
    "/loan_borrowed",
    options,
    indexerUrl,
  );
}

export async function fetchMarginIndexerLoanRepaid(
  options?: MarginIndexerQueryOptions,
  indexerUrl?: string,
): Promise<MarginIndexerLoanRepaidRecord[]> {
  return fetchMarginIndexerArray<MarginIndexerLoanRepaidRecord>("/loan_repaid", options, indexerUrl);
}

export async function fetchMarginIndexerManagerStates(
  options?: MarginIndexerQueryOptions,
  indexerUrl?: string,
): Promise<MarginIndexerManagerStateRecord[]> {
  return fetchMarginIndexerArray<MarginIndexerManagerStateRecord>(
    "/margin_manager_states",
    options,
    indexerUrl,
  );
}

export async function fetchMarginIndexerManagersInfo(
  indexerUrl?: string,
): Promise<MarginIndexerManagersInfoRecord[]> {
  try {
    const body = await marginIndexerFetch<MarginIndexerManagersInfoRecord[]>(
      "/margin_managers_info",
      indexerUrl,
    );
    return Array.isArray(body) ? body : [];
  } catch (err) {
    if (err instanceof IndexerRequestError && (err.status === 404 || err.status === 400)) {
      return [];
    }
    throw err;
  }
}
