import { z } from "zod";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import {
  queryMarginManagerInfo,
  type MarginManagerInfoQueryResult,
} from "./deepbook-margin-read.service.js";
import { queryMarginOpenOrders } from "./deepbook-margin-open-orders-read.service.js";
import { queryMarginPoolInfo } from "./deepbook-margin-pool-read.service.js";
import { queryMarginTpslInfo } from "./deepbook-margin-tpsl-read.service.js";
import {
  queryMarginAtRiskStates,
  queryMarginCollateralHistory,
  queryMarginLiquidations,
  queryMarginLoanHistory,
  queryMarginManagersInfo,
  queryMarginManagerCreated,
  queryMarginSupplyHistory,
  queryMarginIndexerSupply,
} from "./deepbook-margin-indexer-read.service.js";

const marginManagerInfoQuerySchema = z
  .object({
    margin_manager_key: z.string().min(1).optional(),
    margin_manager_address: z.string().min(1).optional(),
    pool_key: z.string().min(1).optional(),
  })
  .passthrough();

const marginPoolInfoQuerySchema = z
  .object({
    pool_key: z.string().min(1).optional(),
    coin_type: z.string().min(1).optional(),
    coin_key: z.string().min(1).optional(),
    supplier_cap_id: z.string().min(1).optional(),
  })
  .passthrough();

const marginOpenOrdersQuerySchema = z
  .object({
    pool_key: z.string().min(1).optional(),
    margin_manager_key: z.string().min(1).optional(),
    margin_manager_address: z.string().min(1).optional(),
  })
  .passthrough();

const marginTpslInfoQuerySchema = z
  .object({
    margin_manager_key: z.string().min(1).optional(),
    margin_manager_address: z.string().min(1).optional(),
    pool_key: z.string().min(1).optional(),
    conditional_order_id: z.string().min(1).optional(),
  })
  .passthrough();

const marginIndexerQuerySchema = z
  .object({
    margin_manager_id: z.string().min(1).optional(),
    margin_manager_key: z.string().min(1).optional(),
    margin_pool_id: z.string().min(1).optional(),
    deepbook_pool_id: z.string().min(1).optional(),
    pool_key: z.string().min(1).optional(),
    max_risk_ratio: z.coerce.number().optional(),
    start_time: z.coerce.number().optional(),
    end_time: z.coerce.number().optional(),
    limit: z.coerce.number().int().positive().optional(),
    type: z.enum(["Deposit", "Withdraw"]).optional(),
    is_base: z.coerce.boolean().optional(),
    supplier: z.string().min(1).optional(),
  })
  .passthrough();

function queryRecord(query: unknown): Record<string, unknown> {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return {};
  }
  return query as Record<string, unknown>;
}

function defaultTradingPoolKey(): string {
  return getDeepBookEnv().defaultPool;
}

export function parseMarginPoolInfoQuery(query: unknown) {
  const parsed = marginPoolInfoQuerySchema.parse(queryRecord(query));
  return {
    ...parsed,
    pool_key: parsed.pool_key ?? defaultTradingPoolKey(),
  };
}

/** Focused risk snapshot derived from margin manager live state. */
export function shapeMarginRiskRatioResponse(info: MarginManagerInfoQueryResult) {
  const live = info.live_state;

  if (!info.provisioned) {
    return {
      provisioned: false,
      note: info.note,
      available_margin_pools: info.available_margin_pools,
    };
  }

  if (!live) {
    return {
      provisioned: true,
      margin_manager_key: info.margin_manager_key,
      margin_manager_address: info.margin_manager_address,
      live_state_error: info.live_state_error,
      note: info.note,
    };
  }

  return {
    provisioned: true,
    margin_manager_key: info.margin_manager_key,
    margin_manager_address: info.margin_manager_address,
    pool_key: live.pool_key,
    risk_ratio: live.risk_ratio,
    max_leverage: live.max_leverage,
    liquidation_ratio: live.liquidation_ratio,
    borrow_threshold: live.borrow_threshold,
    base_balance: live.base_balance,
    quote_balance: live.quote_balance,
    base_debt: live.base_debt,
    quote_debt: live.quote_debt,
  };
}

/** HTTP wrapper — same data as query_chain margin_manager_info. */
export async function getMarginManagerInfoForHttp(privyUserId: string, query: unknown) {
  const params = marginManagerInfoQuerySchema.parse(queryRecord(query));
  return queryMarginManagerInfo(privyUserId, params);
}

/** HTTP wrapper — same data as query_chain margin_pool_info. */
export async function getMarginPoolInfoForHttp(privyUserId: string, query: unknown) {
  const params = parseMarginPoolInfoQuery(query);
  return queryMarginPoolInfo(privyUserId, params);
}

/** Focused risk snapshot derived from margin manager live state. */
export async function getMarginRiskRatioForHttp(privyUserId: string, query: unknown) {
  const info = await getMarginManagerInfoForHttp(privyUserId, query);
  return shapeMarginRiskRatioResponse(info);
}

/** HTTP wrapper — same data as query_chain margin_open_orders. */
export async function getMarginOpenOrdersForHttp(privyUserId: string, query: unknown) {
  const params = marginOpenOrdersQuerySchema.parse(queryRecord(query));
  return queryMarginOpenOrders(privyUserId, params);
}

/** HTTP wrapper — same data as query_chain margin_tpsl_info. */
export async function getMarginTpslInfoForHttp(privyUserId: string, query: unknown) {
  const params = marginTpslInfoQuerySchema.parse(queryRecord(query));
  return queryMarginTpslInfo(privyUserId, params);
}

function parseMarginIndexerQuery(query: unknown): Record<string, unknown> {
  return marginIndexerQuerySchema.parse(queryRecord(query));
}

export async function getMarginLiquidationsForHttp(privyUserId: string, query: unknown) {
  return queryMarginLiquidations(privyUserId, parseMarginIndexerQuery(query));
}

export async function getMarginCollateralHistoryForHttp(privyUserId: string, query: unknown) {
  return queryMarginCollateralHistory(privyUserId, parseMarginIndexerQuery(query));
}

export async function getMarginLoanHistoryForHttp(privyUserId: string, query: unknown) {
  return queryMarginLoanHistory(privyUserId, parseMarginIndexerQuery(query));
}

export async function getMarginAtRiskStatesForHttp(privyUserId: string, query: unknown) {
  return queryMarginAtRiskStates(privyUserId, parseMarginIndexerQuery(query));
}

export async function getMarginManagersInfoForHttp(privyUserId: string, query: unknown) {
  return queryMarginManagersInfo(privyUserId, parseMarginIndexerQuery(query));
}

export async function getMarginManagerCreatedForHttp(privyUserId: string, query: unknown) {
  return queryMarginManagerCreated(privyUserId, parseMarginIndexerQuery(query));
}

export async function getMarginSupplyHistoryForHttp(privyUserId: string, query: unknown) {
  return queryMarginSupplyHistory(privyUserId, parseMarginIndexerQuery(query));
}

export async function getMarginIndexerSupplyForHttp(privyUserId: string, query: unknown) {
  return queryMarginIndexerSupply(privyUserId, parseMarginIndexerQuery(query));
}
