import { AppError } from "../../errors/app-error.js";
import { getAdapter } from "../chains/registry.js";
import {
  checkManagerBalance,
  ensureBalanceManager,
  getDeepBookManagerBalances,
  getDeepBookManagerInfo,
} from "../defi/deepbook/deepbook-balance-manager.service.js";
import {
  getDeepBookPoolInfo,
  getDeepBookTicker,
  listDeepBookPools,
} from "../defi/deepbook/deepbook-pools.service.js";
import { getDeepBookEnv } from "../../config/deepbook.js";
import { getDeepBookSwapQuote } from "../defi/deepbook/deepbook-swap.service.js";
import { getDeepBookOpenOrders } from "../defi/deepbook/deepbook-orders.service.js";
import { getFlashLoanBundleQuote } from "../defi/deepbook/deepbook-flash-loan-quote.js";
import {
  getDeepBookStakeBalance,
  getDeepBookStakeRequired,
} from "../defi/deepbook/deepbook-stake.service.js";
import { getDeepBookGovernanceState } from "../defi/deepbook/deepbook-governance.service.js";
import {
  getDeepBookIndexerStatus,
  getDeepBookOhlcv,
  getDeepBookTrades,
  getDeepBookVolume,
} from "../defi/deepbook/deepbook-indexer-analytics.service.js";
import { queryAgentTransactions } from "../agent-transaction/agent-transaction.service.js";
import { getWalletAssetsForPrivyUser } from "../wallet/wallet-assets.service.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findProjectByIdForUser } from "../projects/project.repository.js";
import { buildProjectActionsCatalogResponse } from "../projects/app-action-schema.service.js";
import { listAppActionsCatalogForSession } from "../projects/app-action-catalog.service.js";
import { resolveAppScope } from "../projects/app-scope-resolver.service.js";
import {
  getPredictState,
  getOracleState,
  getTradeAmounts,
  getRangeTradeAmounts,
  getVaultSummary,
  getManagerSummary,
} from "../defi/deepbook/deepbook-predict-server.client.js";
import { getPredictObjectId } from "../defi/deepbook/deepbook-predict.service.js";
import { queryMarginManagerInfo } from "../defi/deepbook/deepbook-margin-read.service.js";
import { queryMarginPoolInfo } from "../defi/deepbook/deepbook-margin-pool-read.service.js";
import { queryMarginTpslInfo } from "../defi/deepbook/deepbook-margin-tpsl-read.service.js";
import type { BalanceContext } from "../chains/types.js";
import type { AgentToolOptions } from "./execute-transaction-context.js";
import {
  queryChainInputSchema,
  type QueryChainInput,
  type QueryChainResult,
} from "./agent.types.js";

export const QUERY_CHAIN_TOOL_NAME = "query_chain" as const;

function assertSuiDeepBookQuery(chainId: string): void {
  if (chainId !== "sui") {
    throw new AppError(
      400,
      "UNSUPPORTED_QUERY",
      "DeepBook queries are only available on Sui.",
    );
  }
}

export const queryChainToolDefinition = {
  name: QUERY_CHAIN_TOOL_NAME,
  description:
    "Read-only chain queries for the authenticated user's agent wallet. " +
    "Wallet address is resolved from session — never pass wallet addresses.",
  input_schema: {
    type: "object" as const,
    properties: {
      chain_id: {
        type: "string",
        enum: ["sui", "ethereum", "solana"],
        description: "Target chain (must be enabled for this app).",
      },
      query: {
        type: "string",
        enum: [
          "balance",
          "native_balance",
          "token_balances",
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
          "agent_transactions",
          "project_actions",
          "session_actions",
          "margin_pool_info",
          "margin_manager_info",
          "margin_tpsl_info",
          "predict_markets",
          "predict_trade_amounts",
          "predict_range_amounts",
          "predict_manager_info",
          "predict_vault_summary",
        ],
        description:
          "Read-only query type: balances, wallet holdings, DeepBook manager, pool market data, swap_quote, flash_loan_quote, deepbook_open_orders, stake/governance, deepbook_trades, deepbook_volume, deepbook_ohlcv, agent_transactions, project_actions, session_actions, margin_pool_info, margin_manager_info, margin_tpsl_info, predict_markets, predict_trade_amounts, predict_range_amounts, predict_manager_info, or predict_vault_summary.",
      },
      params: {
        type: "object",
        description:
          "Query params. swap_quote: { pool_key?, amount, side: sell|buy } — " +
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
          "agent_transactions: optional { limit (max 10), status, category, session_id, transaction_id } — " +
          "returns recent agent wallet activity; response includes summary (date, amount, status, digest) to quote in chat. " +
          "project_actions: { project_id } OR { app_name } — saved project action schema. Never pass an app name as project_id. " +
          "session_actions: optional { app_name } — chat draft artifact action schema (unsaved preview). Uses current chat session. " +
          "margin_pool_info: { pool_key?, coin_type? } — margin pool live supply/borrow/interest/utilization plus trading-pool leverage config. " +
          "Use pool_key to list margin-enabled trading pools; coin_type selects the lending asset (defaults to quote coin). " +
          "margin_manager_info: { margin_manager_key?, pool_key? } — margin manager address, live balances, borrowed amounts, and risk ratio. " +
          "margin_tpsl_info: { conditional_order_id? } — conditional TPSL order IDs, take-profit/stop-loss trigger bounds. " +
          "predict_markets: {} — active oracles with spot/forward prices, lifecycle, expiry. " +
          "predict_trade_amounts: { oracle_id, expiry, strike, is_up, quantity } — preview mint cost and redeem payout for a binary position. " +
          "predict_range_amounts: { oracle_id, expiry, lower_strike, higher_strike, quantity } — preview for range position. " +
          "predict_manager_info: { manager_id? } — predict manager balances and positions. " +
          "predict_vault_summary: {} — vault total value, PLP supply, max payout, withdrawal available. " +
          "EVM balances: { evm_chain_id }.",
        additionalProperties: true,
      },
    },
    required: ["chain_id", "query"] as const,
    additionalProperties: false,
  },
};

export async function runQueryChainTool(
  privyUserId: string,
  input: QueryChainInput,
  options?: Pick<AgentToolOptions, "flashLoanTurnIntent" | "sessionId">,
): Promise<QueryChainResult> {
  const parsed = queryChainInputSchema.parse(input);
  const wallet = await resolveAgentWalletByPrivyUserId(
    privyUserId,
    parsed.chain_id,
  );

  if (!wallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${parsed.chain_id}".`,
    );
  }

  const context: BalanceContext | undefined =
    parsed.chain_id === "ethereum" && parsed.params.evm_chain_id !== undefined
      ? { evm_chain_id: parsed.params.evm_chain_id }
      : undefined;

  const adapter = getAdapter(parsed.chain_id);

  switch (parsed.query) {
    case "balance":
    case "native_balance":
      return adapter.getBalance(wallet.address, context);
    case "token_balances":
      return getWalletAssetsForPrivyUser(privyUserId, {
        chain_id: parsed.chain_id,
        evm_chain_id: parsed.params.evm_chain_id,
        include_zero: parsed.params.include_zero,
        include_usd: parsed.params.include_usd,
      });
    case "deepbook_manager_info": {
      if (parsed.chain_id !== "sui") {
        throw new AppError(
          400,
          "UNSUPPORTED_QUERY",
          "deepbook_manager_info is only available on Sui.",
        );
      }
      return getDeepBookManagerInfo(privyUserId);
    }
    case "deepbook_manager_balance": {
      if (parsed.chain_id !== "sui") {
        throw new AppError(
          400,
          "UNSUPPORTED_QUERY",
          "deepbook_manager_balance is only available on Sui.",
        );
      }
      if (parsed.params.coin_key) {
        const manager = await ensureBalanceManager(privyUserId);
        const balance = await checkManagerBalance(
          privyUserId,
          parsed.params.coin_key,
        );
        return {
          chain_id: "sui",
          manager_key: manager.manager_key,
          manager_object_id: manager.manager_object_id,
          balances: [balance],
        };
      }
      return getDeepBookManagerBalances(privyUserId, parsed.params.coin_keys);
    }
    case "deepbook_pools": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return listDeepBookPools();
    }
    case "deepbook_ticker": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookTicker();
    }
    case "deepbook_pool_info": {
      assertSuiDeepBookQuery(parsed.chain_id);
      const poolKey = parsed.params.pool_key ?? getDeepBookEnv().defaultPool;
      return getDeepBookPoolInfo(poolKey, privyUserId);
    }
    case "swap_quote": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookSwapQuote(privyUserId, parsed.params);
    }
    case "flash_loan_quote": {
      assertSuiDeepBookQuery(parsed.chain_id);
      const advisoryQuote = options?.flashLoanTurnIntent === "research";
      return getFlashLoanBundleQuote(privyUserId, parsed.params, {
        emitProgress: !advisoryQuote,
        advisoryQuote,
      });
    }
    case "deepbook_open_orders": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookOpenOrders(privyUserId, parsed.params);
    }
    case "deepbook_stake_balance": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookStakeBalance(privyUserId, parsed.params);
    }
    case "deepbook_stake_required": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookStakeRequired(privyUserId, parsed.params);
    }
    case "deepbook_governance_state": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookGovernanceState(privyUserId, parsed.params);
    }
    case "deepbook_trades": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookTrades(parsed.params);
    }
    case "deepbook_volume": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookVolume(privyUserId, parsed.params);
    }
    case "deepbook_ohlcv": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return getDeepBookOhlcv(parsed.params);
    }
    case "agent_transactions": {
      return queryAgentTransactions(privyUserId, {
        chainId: parsed.chain_id,
        limit: parsed.params.limit,
        status: parsed.params.status,
        category: parsed.params.category,
        sessionId: parsed.params.session_id,
        transactionId: parsed.params.transaction_id,
      });
    }
    case "margin_pool_info": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return queryMarginPoolInfo(privyUserId, parsed.params);
    }
    case "margin_manager_info": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return queryMarginManagerInfo(privyUserId, parsed.params);
    }
    case "margin_tpsl_info": {
      assertSuiDeepBookQuery(parsed.chain_id);
      return queryMarginTpslInfo(privyUserId, parsed.params);
    }
    case "predict_markets": {
      assertSuiDeepBookQuery(parsed.chain_id);
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
    }
    case "predict_trade_amounts": {
      assertSuiDeepBookQuery(parsed.chain_id);
      const oracleId = String(parsed.params.oracle_id ?? "");
      const tradeExpiry = Number(parsed.params.expiry);
      const tradeStrike = Number(parsed.params.strike);
      const tradeIsUp = Boolean(parsed.params.is_up);
      const tradeQty = Number(parsed.params.quantity);
      if (!oracleId || !tradeExpiry || isNaN(tradeStrike) || !tradeQty) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "predict_trade_amounts requires: oracle_id, expiry, strike, is_up, quantity",
        );
      }
      const amounts = await getTradeAmounts(oracleId, tradeExpiry, tradeStrike, tradeIsUp, tradeQty);
      return {
        oracle_id: oracleId,
        expiry: tradeExpiry,
        strike: tradeStrike,
        is_up: tradeIsUp,
        quantity: tradeQty,
        mint_cost: amounts.mintCost,
        redeem_payout: amounts.redeemPayout,
      };
    }
    case "predict_range_amounts": {
      assertSuiDeepBookQuery(parsed.chain_id);
      const rangeOracleId = String(parsed.params.oracle_id ?? "");
      const rangeExpiry = Number(parsed.params.expiry);
      const rangeLower = Number(parsed.params.lower_strike);
      const rangeHigher = Number(parsed.params.higher_strike);
      const rangeQty = Number(parsed.params.quantity);
      if (!rangeOracleId || !rangeExpiry || isNaN(rangeLower) || isNaN(rangeHigher) || !rangeQty) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "predict_range_amounts requires: oracle_id, expiry, lower_strike, higher_strike, quantity",
        );
      }
      const amounts = await getRangeTradeAmounts(rangeOracleId, rangeExpiry, rangeLower, rangeHigher, rangeQty);
      return {
        oracle_id: rangeOracleId,
        expiry: rangeExpiry,
        lower_strike: rangeLower,
        higher_strike: rangeHigher,
        quantity: rangeQty,
        mint_cost: amounts.mintCost,
        redeem_payout: amounts.redeemPayout,
      };
    }
    case "predict_manager_info": {
      assertSuiDeepBookQuery(parsed.chain_id);
      const managerId = parsed.params.manager_id as string | undefined;
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
    }
    case "predict_vault_summary": {
      assertSuiDeepBookQuery(parsed.chain_id);
      const predictId = getPredictObjectId();
      const vault = await getVaultSummary(predictId);
      return {
        total_value: vault.totalValue,
        total_plp: vault.totalPLP,
        max_payout: vault.maxPayout,
        accepted_quote_assets: vault.acceptedQuoteAssets,
        withdrawal_available: vault.withdrawalAvailable,
      };
    }
    case "project_actions":
    case "session_actions": {
      const useSession = parsed.query === "session_actions";
      const projectId = parsed.params.project_id;
      const appName = parsed.params.app_name;

      if (!useSession && projectId) {
        const user = await findUserByPrivyId(privyUserId);
        if (!user) {
          throw new AppError(404, "USER_NOT_FOUND", "User not found");
        }

        const project = await findProjectByIdForUser(projectId, user.id);
        if (!project) {
          throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
        }

        return buildProjectActionsCatalogResponse(project);
      }

      if (!options?.sessionId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          useSession
            ? "session_actions requires an active chat session."
            : "project_actions requires params.project_id (UUID) or params.app_name with a chat session.",
        );
      }

      const scope = await resolveAppScope(privyUserId, options.sessionId, {
        project_id: useSession ? undefined : projectId,
        app_name: appName,
        use_session_draft: useSession || (!projectId && !appName),
      });

      if (scope.kind === "project") {
        const user = await findUserByPrivyId(privyUserId);
        if (!user) {
          throw new AppError(404, "USER_NOT_FOUND", "User not found");
        }
        const project = await findProjectByIdForUser(scope.project_id, user.id);
        if (!project) {
          throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
        }
        return buildProjectActionsCatalogResponse(project);
      }

      const catalog = await listAppActionsCatalogForSession(privyUserId, scope.session_id);
      return catalog;
    }
    default:
      throw new AppError(
        400,
        "UNSUPPORTED_QUERY",
        `Unsupported query: ${parsed.query}`,
      );
  }
}
