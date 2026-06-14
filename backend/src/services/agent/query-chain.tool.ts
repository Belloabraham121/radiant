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
        ],
        description:
          "Read-only query type: balances, wallet holdings, DeepBook manager, pool market data, swap_quote, flash_loan_quote, deepbook_open_orders, stake/governance, deepbook_trades, deepbook_volume, deepbook_ohlcv, or agent_transactions.",
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
  options?: Pick<AgentToolOptions, "flashLoanTurnIntent">,
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
    default:
      throw new AppError(
        400,
        "UNSUPPORTED_QUERY",
        `Unsupported query: ${parsed.query}`,
      );
  }
}
