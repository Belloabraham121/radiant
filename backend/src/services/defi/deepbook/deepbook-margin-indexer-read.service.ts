import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { resolveMarginManagerIdsForUser } from "./margin-manager-lookup.service.js";
import { queryMarginManagerInfo } from "./deepbook-margin-read.service.js";
import {
  fetchMarginIndexerCollateralEvents,
  fetchMarginIndexerLiquidations,
  fetchMarginIndexerLoanBorrowed,
  fetchMarginIndexerLoanRepaid,
  fetchMarginIndexerManagerStates,
  fetchMarginIndexerManagersInfo,
} from "./indexer/deepbook-margin-indexer.client.js";
import type {
  MarginIndexerCollateralRecord,
  MarginIndexerLiquidationRecord,
  MarginIndexerLoanBorrowedRecord,
  MarginIndexerLoanRepaidRecord,
  MarginIndexerManagerStateRecord,
  MarginIndexerQueryOptions,
} from "./indexer/margin-indexer.types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type MarginIndexerQueryParams = {
  margin_manager_id?: string;
  margin_manager_key?: string;
  margin_pool_id?: string;
  deepbook_pool_id?: string;
  pool_key?: string;
  max_risk_ratio?: number;
  start_time?: number;
  end_time?: number;
  limit?: number;
  type?: "Deposit" | "Withdraw";
  is_base?: boolean;
};

function clampLimit(raw: unknown): number {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeIndexerOptions(params: Record<string, unknown>): MarginIndexerQueryOptions {
  return {
    start_time:
      typeof params.start_time === "number" && Number.isFinite(params.start_time)
        ? params.start_time
        : undefined,
    end_time:
      typeof params.end_time === "number" && Number.isFinite(params.end_time)
        ? params.end_time
        : undefined,
    limit: clampLimit(params.limit),
    margin_manager_id:
      typeof params.margin_manager_id === "string" ? params.margin_manager_id : undefined,
    margin_pool_id:
      typeof params.margin_pool_id === "string" ? params.margin_pool_id : undefined,
    deepbook_pool_id:
      typeof params.deepbook_pool_id === "string" ? params.deepbook_pool_id : undefined,
    max_risk_ratio:
      typeof params.max_risk_ratio === "number" && Number.isFinite(params.max_risk_ratio)
        ? params.max_risk_ratio
        : undefined,
    type: params.type === "Deposit" || params.type === "Withdraw" ? params.type : undefined,
    is_base:
      params.is_base === true || params.is_base === "true"
        ? true
        : params.is_base === false || params.is_base === "false"
          ? false
          : undefined,
  };
}

async function resolveMarginManagerId(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<string | null> {
  if (typeof params.margin_manager_id === "string" && params.margin_manager_id.length > 0) {
    return params.margin_manager_id;
  }

  const info = await queryMarginManagerInfo(privyUserId, params);
  return info.margin_manager_address ?? null;
}

async function resolveDeepbookPoolId(
  _privyUserId: string,
  params: Record<string, unknown>,
): Promise<string | undefined> {
  if (typeof params.deepbook_pool_id === "string" && params.deepbook_pool_id.length > 0) {
    return params.deepbook_pool_id;
  }

  const poolKey = typeof params.pool_key === "string" ? params.pool_key : undefined;
  if (!poolKey) {
    return undefined;
  }

  const env = getDeepBookEnv();
  const pool = env.pools[poolKey as keyof typeof env.pools];
  return pool?.address;
}

function withSource<T extends Record<string, unknown>>(payload: T): T & { source: "indexer" } {
  return { ...payload, source: "indexer" as const };
}

export async function queryMarginLiquidations(
  privyUserId: string,
  params: Record<string, unknown>,
) {
  const options = normalizeIndexerOptions(params);
  const marginManagerId = await resolveMarginManagerId(privyUserId, params);
  if (!marginManagerId && !options.margin_pool_id) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "margin_liquidations requires margin_manager_id or a provisioned margin manager on this wallet.",
    );
  }

  const events = await fetchMarginIndexerLiquidations({
    ...options,
    margin_manager_id: marginManagerId ?? options.margin_manager_id,
  });

  return withSource({
    margin_manager_id: marginManagerId,
    margin_pool_id: options.margin_pool_id ?? null,
    count: events.length,
    events,
    summary: formatMarginLiquidationsSummary(events),
  });
}

export async function queryMarginCollateralHistory(
  privyUserId: string,
  params: Record<string, unknown>,
) {
  const options = normalizeIndexerOptions(params);
  const marginManagerId = await resolveMarginManagerId(privyUserId, params);
  if (!marginManagerId) {
    throw new AppError(
      400,
      "NO_MARGIN_MANAGER",
      "No margin manager found for collateral history. Create one with margin_provision_manager first.",
    );
  }

  const events = await fetchMarginIndexerCollateralEvents({
    ...options,
    margin_manager_id: marginManagerId,
  });

  return withSource({
    margin_manager_id: marginManagerId,
    count: events.length,
    events,
    summary: formatMarginCollateralSummary(events),
  });
}

export async function queryMarginLoanHistory(
  privyUserId: string,
  params: Record<string, unknown>,
) {
  const options = normalizeIndexerOptions(params);
  const marginManagerId = await resolveMarginManagerId(privyUserId, params);
  if (!marginManagerId && !options.margin_pool_id) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "margin_loan_history requires margin_manager_id or a provisioned margin manager.",
    );
  }

  const queryBase = {
    ...options,
    margin_manager_id: marginManagerId ?? options.margin_manager_id,
  };

  const [borrowed, repaid] = await Promise.all([
    fetchMarginIndexerLoanBorrowed(queryBase),
    fetchMarginIndexerLoanRepaid(queryBase),
  ]);

  return withSource({
    margin_manager_id: marginManagerId,
    margin_pool_id: options.margin_pool_id ?? null,
    borrowed_count: borrowed.length,
    repaid_count: repaid.length,
    borrowed,
    repaid,
    summary: formatMarginLoanHistorySummary(borrowed, repaid),
  });
}

export async function queryMarginAtRiskStates(
  privyUserId: string,
  params: Record<string, unknown>,
) {
  const options = normalizeIndexerOptions(params);
  const deepbookPoolId = await resolveDeepbookPoolId(privyUserId, params);

  const states = await fetchMarginIndexerManagerStates({
    ...options,
    deepbook_pool_id: deepbookPoolId ?? options.deepbook_pool_id,
  });

  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  const lookup = wallet
    ? await resolveMarginManagerIdsForUser(privyUserId, wallet.address)
    : { margin_manager_ids: [] as string[] };
  const walletManagerIds = new Set(lookup.margin_manager_ids);
  const scoped =
    walletManagerIds.size > 0
      ? states.filter((row) => walletManagerIds.has(row.margin_manager_id))
      : states;

  return withSource({
    deepbook_pool_id: deepbookPoolId ?? options.deepbook_pool_id ?? null,
    max_risk_ratio: options.max_risk_ratio ?? null,
    count: scoped.length,
    states: scoped,
    summary: formatMarginAtRiskSummary(scoped, options.max_risk_ratio),
  });
}

export async function queryMarginManagersInfo(_privyUserId: string, _params: Record<string, unknown>) {
  const managers = await fetchMarginIndexerManagersInfo();
  return withSource({
    count: managers.length,
    managers,
    summary:
      managers.length === 0
        ? "No margin managers indexed yet."
        : `${managers.length} margin manager(s) indexed across DeepBook pools.`,
  });
}

function formatIsoTime(ms: number): string {
  return new Date(ms).toISOString();
}

export function formatMarginLiquidationsSummary(events: MarginIndexerLiquidationRecord[]): string {
  if (events.length === 0) {
    return "No liquidation events in the requested window.";
  }
  const lines = events.slice(0, 5).map((event, index) => {
    const ratio =
      Number.isFinite(event.risk_ratio) && event.risk_ratio > 1_000_000
        ? (event.risk_ratio / 1_000_000_000).toFixed(4)
        : String(event.risk_ratio);
    return (
      `${index + 1}. manager ${event.margin_manager_id.slice(0, 10)}… ` +
      `liquidated ${event.liquidation_amount} (risk ${ratio}) at ${formatIsoTime(event.onchain_timestamp)}`
    );
  });
  const suffix = events.length > 5 ? `\n… and ${events.length - 5} more.` : "";
  return `Found ${events.length} liquidation event(s):\n${lines.join("\n")}${suffix}`;
}

export function formatMarginCollateralSummary(events: MarginIndexerCollateralRecord[]): string {
  if (events.length === 0) {
    return "No collateral deposit/withdraw events in the requested window.";
  }
  const lines = events.slice(0, 5).map((event, index) => {
    return (
      `${index + 1}. ${event.event_type} ${event.amount} ` +
      `(${event.asset_type.slice(0, 20)}…) at ${formatIsoTime(event.onchain_timestamp)}`
    );
  });
  const suffix = events.length > 5 ? `\n… and ${events.length - 5} more.` : "";
  return `Found ${events.length} collateral event(s):\n${lines.join("\n")}${suffix}`;
}

export function formatMarginLoanHistorySummary(
  borrowed: MarginIndexerLoanBorrowedRecord[],
  repaid: MarginIndexerLoanRepaidRecord[],
): string {
  if (borrowed.length === 0 && repaid.length === 0) {
    return "No borrow or repay events in the requested window.";
  }
  return (
    `Margin loan history: ${borrowed.length} borrow event(s), ${repaid.length} repay event(s). ` +
    (borrowed[0]
      ? `Latest borrow: ${borrowed[0].loan_amount} at ${formatIsoTime(borrowed[0].onchain_timestamp)}.`
      : "") +
    (repaid[0]
      ? ` Latest repay: ${repaid[0].repay_amount} at ${formatIsoTime(repaid[0].onchain_timestamp)}.`
      : "")
  );
}

export function formatMarginAtRiskSummary(
  states: MarginIndexerManagerStateRecord[],
  maxRiskRatio?: number,
): string {
  if (states.length === 0) {
    return maxRiskRatio != null
      ? `No margin managers below risk ratio ${maxRiskRatio}.`
      : "No margin manager states returned from indexer.";
  }
  const lines = states.slice(0, 5).map((row, index) => {
    return (
      `${index + 1}. ${row.base_asset_symbol}/${row.quote_asset_symbol} ` +
      `risk ${row.risk_ratio} — base debt ${row.base_debt}, quote debt ${row.quote_debt}`
    );
  });
  const suffix = states.length > 5 ? `\n… and ${states.length - 5} more.` : "";
  return `Found ${states.length} margin manager state(s):\n${lines.join("\n")}${suffix}`;
}
