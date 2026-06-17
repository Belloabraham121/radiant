import { z } from "zod";
import {
  getDeepBookOhlcv,
  getDeepBookTrades,
  getDeepBookVolume,
} from "./deepbook-indexer-analytics.service.js";

const poolKeyQuerySchema = z
  .object({
    pool_key: z.string().min(1).optional(),
    pool: z.string().min(1).optional(),
  })
  .passthrough();

const ohlcvQuerySchema = poolKeyQuerySchema.extend({
  interval: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const tradesQuerySchema = poolKeyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  start_time: z.coerce.number().optional(),
  end_time: z.coerce.number().optional(),
});

const volumeQuerySchema = poolKeyQuerySchema.extend({
  start_time: z.coerce.number().optional(),
  end_time: z.coerce.number().optional(),
  scope: z.enum(["pool", "manager", "all_pools"]).optional(),
  for_manager: z.coerce.boolean().optional(),
  all_pools: z.coerce.boolean().optional(),
  interval: z.string().min(1).optional(),
});

function queryRecord(query: unknown): Record<string, unknown> {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return {};
  }
  return query as Record<string, unknown>;
}

function withPoolKey(params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.pool_key === "string" && params.pool_key.length > 0) {
    return params;
  }
  if (typeof params.pool === "string" && params.pool.length > 0) {
    return { ...params, pool_key: params.pool };
  }
  return params;
}

/** HTTP wrapper — same data as query_chain deepbook_ohlcv. */
export async function getDeepBookOhlcvForHttp(_privyUserId: string, query: unknown) {
  const params = ohlcvQuerySchema.parse(queryRecord(query));
  return getDeepBookOhlcv(withPoolKey(params));
}

/** HTTP wrapper — same data as query_chain deepbook_trades. */
export async function getDeepBookTradesForHttp(_privyUserId: string, query: unknown) {
  const params = tradesQuerySchema.parse(queryRecord(query));
  return getDeepBookTrades(withPoolKey(params));
}

/** HTTP wrapper — same data as query_chain deepbook_volume. */
export async function getDeepBookVolumeForHttp(privyUserId: string, query: unknown) {
  const params = volumeQuerySchema.parse(queryRecord(query));
  return getDeepBookVolume(privyUserId, withPoolKey(params));
}
