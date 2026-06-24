import { AppError } from "../../../../../errors/app-error.js";
import {
  checkManagerBalance,
  ensureBalanceManager,
  getDeepBookManagerBalances,
  getDeepBookManagerInfo,
} from "../../../../defi/deepbook/deepbook-balance-manager.service.js";
import {
  getDeepBookPoolInfo,
  getDeepBookTicker,
  listDeepBookPools,
} from "../../../../defi/deepbook/deepbook-pools.service.js";
import { getDeepBookEnv } from "../../../../../config/deepbook.js";
import { getDeepBookSwapQuote } from "../../../../defi/deepbook/deepbook-swap.service.js";
import { getDeepBookOpenOrders } from "../../../../defi/deepbook/deepbook-orders.service.js";
import { getFlashLoanBundleQuote } from "../../../../defi/deepbook/deepbook-flash-loan-quote.js";
import {
  getDeepBookStakeBalance,
  getDeepBookStakeRequired,
} from "../../../../defi/deepbook/deepbook-stake.service.js";
import { getDeepBookGovernanceState } from "../../../../defi/deepbook/deepbook-governance.service.js";
import {
  getDeepBookOhlcv,
  getDeepBookTrades,
  getDeepBookVolume,
} from "../../../../defi/deepbook/deepbook-indexer-analytics.service.js";
import {
  getPredictState,
  getTradeAmounts,
  getRangeTradeAmounts,
  getVaultSummary,
  getManagerSummary,
} from "../../../../defi/deepbook/deepbook-predict-server.client.js";
import { getPredictObjectId } from "../../../../defi/deepbook/deepbook-predict.service.js";
import { queryMarginManagerInfo } from "../../../../defi/deepbook/deepbook-margin-read.service.js";
import { queryMarginPoolInfo } from "../../../../defi/deepbook/deepbook-margin-pool-read.service.js";
import { queryMarginTpslInfo } from "../../../../defi/deepbook/deepbook-margin-tpsl-read.service.js";
import { queryMarginOpenOrders } from "../../../../defi/deepbook/deepbook-margin-open-orders-read.service.js";
import {
  queryMarginAtRiskStates,
  queryMarginCollateralHistory,
  queryMarginLiquidations,
  queryMarginLoanHistory,
  queryMarginManagersInfo,
  queryMarginManagerCreated,
  queryMarginSupplyHistory,
  queryMarginIndexerSupply,
  queryMarginManagerState,
} from "../../../../defi/deepbook/deepbook-margin-indexer-read.service.js";
import type { ChainQueryHandler, QueryHandlerContext } from "../../types.js";

function assertSui(ctx: QueryHandlerContext): void {
  if (ctx.chainId !== "sui") {
    throw new AppError(
      400,
      "UNSUPPORTED_QUERY",
      "DeepBook queries are only available on Sui.",
    );
  }
}

export const DEEPBOOK_QUERY_TYPES = [
  "deepbook_manager_info",
  "deepbook_manager_balance",
  "deepbook_pools",
  "deepbook_pool_info",
  "deepbook_ticker",
  "swap_quote",
  "flash_loan_quote",
  "deepbook_open_orders",
  "deepbook_stake_balance",
  "deepbook_stake_required",
  "deepbook_governance_state",
  "deepbook_trades",
  "deepbook_volume",
  "deepbook_ohlcv",
  "margin_pool_info",
  "margin_manager_info",
  "margin_tpsl_info",
  "margin_open_orders",
  "margin_liquidations",
  "margin_collateral_history",
  "margin_loan_history",
  "margin_at_risk_states",
  "margin_managers_info",
  "margin_manager_created",
  "margin_supply_history",
  "margin_indexer_supply",
  "margin_manager_state",
  "predict_markets",
  "predict_trade_amounts",
  "predict_range_amounts",
  "predict_manager_info",
  "predict_vault_summary",
] as const;

export const DEEPBOOK_QUERY_SCHEMA = {
  description:
    "DeepBook manager, pool market data, swap_quote, flash_loan_quote, deepbook_open_orders, " +
    "stake/governance, deepbook_trades, deepbook_volume, deepbook_ohlcv, margin_pool_info, " +
    "margin_manager_info, margin_tpsl_info, margin_open_orders, margin_liquidations, " +
    "margin_collateral_history, margin_loan_history, margin_at_risk_states, margin_managers_info, " +
    "predict_markets, predict_trade_amounts, predict_range_amounts, predict_manager_info, predict_vault_summary.",
  paramsDescription:
    "swap_quote: { pool_key?, amount, side: sell|buy } — " +
    "sell = spend base for quote (e.g. SUI→USDC); buy = spend quote for base. " +
    "Fees default to input token; set pay_with_deep: true only if wallet holds DEEP. " +
    "flash_loan_quote: { pool_key, borrow_amount, asset: base|quote (or coin_key), strategy: round_trip | swap_chain_repay, steps?: [{ pool_key, side: buy|sell, amount }] } — " +
    "quote before swap_chain_repay execute; pool_key is borrow pool; asset base|quote is borrowed side (USDC on SUI_USDC = quote). " +
    "For swap_chain_repay, steps are optional — omit them to auto-route from live pool quotes. " +
    "deepbook_stake_balance: { pool_key? } — active/inactive DEEP stake for your balance manager on that pool. " +
    "deepbook_stake_required: { pool_key? } — current and next-epoch stake_required and fees for the pool. " +
    "deepbook_governance_state: { pool_key? } — quorum, current/next-epoch trade params, and your stake/vote status for the pool. " +
    "deepbook_trades: { pool_key?, limit?, start_time?, end_time? } — recent trades from the DeepBook indexer (ms timestamps). limit defaults to 50, max 200. " +
    "deepbook_volume: { pool_key?, start_time?, end_time?, scope?: pool|manager|all_pools, for_manager?: true, interval? } — 24h/all-time pool volume; manager scope uses your balance manager; start/end sums trades in range. " +
    "deepbook_ohlcv: { pool_key?, interval?: 1h|1d, limit? } — OHLCV candles from indexer (ohclv endpoint). limit defaults to 48, max 500. " +
    "May also pass input_coin/from + output_coin/to instead of side for swap_quote. " +
    "margin_pool_info: { pool_key?, coin_type? } — margin pool live supply/borrow/interest/utilization plus trading-pool leverage config. " +
    "margin_manager_info: { margin_manager_key?, pool_key? } — margin manager address, live balances, borrowed amounts, and risk ratio. " +
    "margin_tpsl_info: { conditional_order_id? } — conditional TPSL order IDs, take-profit/stop-loss trigger bounds. " +
    "margin_open_orders: { margin_manager_key?, pool_key? } — open leveraged margin orders. " +
    "margin_liquidations: { margin_manager_id?, margin_pool_id?, start_time?, end_time?, limit? } — liquidation events from DeepBook margin indexer. " +
    "margin_collateral_history: { margin_manager_id?, margin_manager_key?, type?: Deposit|Withdraw, start_time?, end_time?, limit? }. " +
    "margin_loan_history: { margin_manager_id?, margin_pool_id?, start_time?, end_time?, limit? }. " +
    "margin_at_risk_states: { pool_key?, deepbook_pool_id?, max_risk_ratio?, limit? }. " +
    "margin_managers_info: {} — indexed margin managers across DeepBook pools. " +
    "margin_manager_created: { margin_manager_id?, margin_manager_key?, start_time?, end_time?, limit? }. " +
    "margin_supply_history: { margin_pool_id?, supplier?, start_time?, end_time?, limit? }. " +
    "margin_indexer_supply: {} — live total supply per margin pool from indexer /margin_supply. " +
    "margin_manager_state: { margin_manager_key?, pool_key? } — live indexer snapshot for your margin manager. " +
    "predict_markets: {} — active oracles with spot/forward prices, lifecycle, expiry. " +
    "predict_trade_amounts: { oracle_id, expiry, strike, is_up, quantity }. " +
    "predict_range_amounts: { oracle_id, expiry, lower_strike, higher_strike, quantity }. " +
    "predict_manager_info: { manager_id? }. " +
    "predict_vault_summary: {} — vault total value, PLP supply, max payout, withdrawal available.",
};

const DEEPBOOK_QUERY_HANDLERS: Record<string, ChainQueryHandler> = {
  deepbook_manager_info: async (ctx) => {
    assertSui(ctx);
    return getDeepBookManagerInfo(ctx.privyUserId);
  },
  deepbook_manager_balance: async (ctx) => {
    assertSui(ctx);
    if (ctx.params.coin_key) {
      const manager = await ensureBalanceManager(ctx.privyUserId);
      const balance = await checkManagerBalance(
        ctx.privyUserId,
        ctx.params.coin_key as string,
      );
      return {
        chain_id: "sui",
        manager_key: manager.manager_key,
        manager_object_id: manager.manager_object_id,
        balances: [balance],
      };
    }
    return getDeepBookManagerBalances(
      ctx.privyUserId,
      ctx.params.coin_keys as string[] | undefined,
    );
  },
  deepbook_pools: async (ctx) => {
    assertSui(ctx);
    return listDeepBookPools();
  },
  deepbook_ticker: async (ctx) => {
    assertSui(ctx);
    return getDeepBookTicker();
  },
  deepbook_pool_info: async (ctx) => {
    assertSui(ctx);
    const poolKey = (ctx.params.pool_key as string | undefined) ?? getDeepBookEnv().defaultPool;
    return getDeepBookPoolInfo(poolKey, ctx.privyUserId);
  },
  swap_quote: async (ctx) => {
    assertSui(ctx);
    return getDeepBookSwapQuote(ctx.privyUserId, ctx.params);
  },
  flash_loan_quote: async (ctx) => {
    assertSui(ctx);
    const advisoryQuote = ctx.options?.flashLoanTurnIntent === "research";
    return getFlashLoanBundleQuote(ctx.privyUserId, ctx.params, {
      emitProgress: !advisoryQuote,
      advisoryQuote,
    });
  },
  deepbook_open_orders: async (ctx) => {
    assertSui(ctx);
    return getDeepBookOpenOrders(ctx.privyUserId, ctx.params);
  },
  deepbook_stake_balance: async (ctx) => {
    assertSui(ctx);
    return getDeepBookStakeBalance(ctx.privyUserId, ctx.params);
  },
  deepbook_stake_required: async (ctx) => {
    assertSui(ctx);
    return getDeepBookStakeRequired(ctx.privyUserId, ctx.params);
  },
  deepbook_governance_state: async (ctx) => {
    assertSui(ctx);
    return getDeepBookGovernanceState(ctx.privyUserId, ctx.params);
  },
  deepbook_trades: async (ctx) => {
    assertSui(ctx);
    return getDeepBookTrades(ctx.params);
  },
  deepbook_volume: async (ctx) => {
    assertSui(ctx);
    return getDeepBookVolume(ctx.privyUserId, ctx.params);
  },
  deepbook_ohlcv: async (ctx) => {
    assertSui(ctx);
    return getDeepBookOhlcv(ctx.params);
  },
  margin_pool_info: async (ctx) => {
    assertSui(ctx);
    return queryMarginPoolInfo(ctx.privyUserId, ctx.params);
  },
  margin_manager_info: async (ctx) => {
    assertSui(ctx);
    return queryMarginManagerInfo(ctx.privyUserId, ctx.params);
  },
  margin_tpsl_info: async (ctx) => {
    assertSui(ctx);
    return queryMarginTpslInfo(ctx.privyUserId, ctx.params);
  },
  margin_open_orders: async (ctx) => {
    assertSui(ctx);
    return queryMarginOpenOrders(ctx.privyUserId, ctx.params);
  },
  margin_liquidations: async (ctx) => {
    assertSui(ctx);
    return queryMarginLiquidations(ctx.privyUserId, ctx.params);
  },
  margin_collateral_history: async (ctx) => {
    assertSui(ctx);
    return queryMarginCollateralHistory(ctx.privyUserId, ctx.params);
  },
  margin_loan_history: async (ctx) => {
    assertSui(ctx);
    return queryMarginLoanHistory(ctx.privyUserId, ctx.params);
  },
  margin_at_risk_states: async (ctx) => {
    assertSui(ctx);
    return queryMarginAtRiskStates(ctx.privyUserId, ctx.params);
  },
  margin_managers_info: async (ctx) => {
    assertSui(ctx);
    return queryMarginManagersInfo(ctx.privyUserId, ctx.params);
  },
  margin_manager_created: async (ctx) => {
    assertSui(ctx);
    return queryMarginManagerCreated(ctx.privyUserId, ctx.params);
  },
  margin_supply_history: async (ctx) => {
    assertSui(ctx);
    return queryMarginSupplyHistory(ctx.privyUserId, ctx.params);
  },
  margin_indexer_supply: async (ctx) => {
    assertSui(ctx);
    return queryMarginIndexerSupply(ctx.privyUserId, ctx.params);
  },
  margin_manager_state: async (ctx) => {
    assertSui(ctx);
    return queryMarginManagerState(ctx.privyUserId, ctx.params);
  },
  predict_markets: async (ctx) => {
    assertSui(ctx);
    const predictId = getPredictObjectId();
    const state = await getPredictState(predictId);
    return {
      predict_id: state.predictId,
      trading_paused: state.tradingPaused,
      quote_assets: state.quoteAssets,
      oracles: state.oracles.map((o) => ({
        oracle_id: o.oracleId,
        spot: o.spot,
        forward: o.forward,
        expiry: o.expiry,
        lifecycle: o.lifecycle,
        settlement_price: o.settlementPrice,
      })),
    };
  },
  predict_trade_amounts: async (ctx) => {
    assertSui(ctx);
    const oracleId = String(ctx.params.oracle_id ?? "");
    const tradeExpiry = Number(ctx.params.expiry);
    const tradeStrike = Number(ctx.params.strike);
    const tradeIsUp = Boolean(ctx.params.is_up);
    const tradeQty = Number(ctx.params.quantity);
    if (!oracleId || !tradeExpiry || isNaN(tradeStrike) || !tradeQty) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "predict_trade_amounts requires: oracle_id, expiry, strike, is_up, quantity",
      );
    }
    const amounts = await getTradeAmounts(
      oracleId,
      tradeExpiry,
      tradeStrike,
      tradeIsUp,
      tradeQty,
    );
    return {
      oracle_id: oracleId,
      expiry: tradeExpiry,
      strike: tradeStrike,
      is_up: tradeIsUp,
      quantity: tradeQty,
      mint_cost: amounts.mintCost,
      redeem_payout: amounts.redeemPayout,
    };
  },
  predict_range_amounts: async (ctx) => {
    assertSui(ctx);
    const rangeOracleId = String(ctx.params.oracle_id ?? "");
    const rangeExpiry = Number(ctx.params.expiry);
    const rangeLower = Number(ctx.params.lower_strike);
    const rangeHigher = Number(ctx.params.higher_strike);
    const rangeQty = Number(ctx.params.quantity);
    if (
      !rangeOracleId ||
      !rangeExpiry ||
      isNaN(rangeLower) ||
      isNaN(rangeHigher) ||
      !rangeQty
    ) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "predict_range_amounts requires: oracle_id, expiry, lower_strike, higher_strike, quantity",
      );
    }
    const amounts = await getRangeTradeAmounts(
      rangeOracleId,
      rangeExpiry,
      rangeLower,
      rangeHigher,
      rangeQty,
    );
    return {
      oracle_id: rangeOracleId,
      expiry: rangeExpiry,
      lower_strike: rangeLower,
      higher_strike: rangeHigher,
      quantity: rangeQty,
      mint_cost: amounts.mintCost,
      redeem_payout: amounts.redeemPayout,
    };
  },
  predict_manager_info: async (ctx) => {
    assertSui(ctx);
    const managerId = ctx.params.manager_id as string | undefined;
    if (!managerId) {
      return {
        note: "Predict manager info requires a manager_id. Use predict_markets first to discover active oracles, then use execute_transaction predict_deposit to set up a manager.",
      };
    }
    const info = await getManagerSummary(managerId);
    return {
      address: info.address,
      owner: info.owner,
      balances: info.balances,
      positions: info.positions.map((p) => ({
        oracle_id: p.marketKey.oracleId,
        expiry: p.marketKey.expiry,
        strike: p.marketKey.strike,
        is_up: p.marketKey.isUp,
        quantity: p.quantity,
      })),
      ranges: info.ranges.map((r) => ({
        oracle_id: r.rangeKey.oracleId,
        expiry: r.rangeKey.expiry,
        lower_strike: r.rangeKey.lowerStrike,
        higher_strike: r.rangeKey.higherStrike,
        quantity: r.quantity,
      })),
    };
  },
  predict_vault_summary: async (ctx) => {
    assertSui(ctx);
    const predictId = getPredictObjectId();
    const vault = await getVaultSummary(predictId);
    return {
      total_value: vault.totalValue,
      total_plp: vault.totalPLP,
      max_payout: vault.maxPayout,
      accepted_quote_assets: vault.acceptedQuoteAssets,
      withdrawal_available: vault.withdrawalAvailable,
    };
  },
};

export function getDeepBookQueryHandler(query: string): ChainQueryHandler | null {
  return DEEPBOOK_QUERY_HANDLERS[query] ?? null;
}

export async function runDeepBookQuery(ctx: QueryHandlerContext) {
  const handler = getDeepBookQueryHandler(ctx.query);
  if (!handler) {
    throw new AppError(400, "UNSUPPORTED_QUERY", `Unsupported DeepBook query: ${ctx.query}`);
  }
  return handler(ctx);
}
