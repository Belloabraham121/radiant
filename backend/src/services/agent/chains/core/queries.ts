import { AppError } from "../../../../errors/app-error.js";
import { getAdapter } from "../../../chains/registry.js";
import { queryAgentTransactions } from "../../../agent-transaction/agent-transaction.service.js";
import { getWalletAssetsForPrivyUser } from "../../../wallet/wallet-assets.service.js";
import {
  queryBridgeCapabilities,
  querySupportedChains,
  queryTokenResolve,
} from "../../../defi/token-resolve.service.js";
import type {
  AgentTransactionCategory,
  AgentTransactionStatus,
} from "../../../agent-transaction/agent-transaction.types.js";
import type { ChainId } from "../../../chains/types.js";
import type { ChainQueryHandler, QueryHandlerContext } from "../types.js";
import { CORE_QUERY_SCHEMA, CORE_QUERY_TYPES } from "./query-schema.js";

function handleBalance(ctx: QueryHandlerContext) {
  const adapter = getAdapter(ctx.chainId);
  return adapter.getBalance(ctx.walletAddress, ctx.balanceContext);
}

function handleTokenBalances(ctx: QueryHandlerContext) {
  return getWalletAssetsForPrivyUser(ctx.privyUserId, {
    chain_id: ctx.chainId,
    evm_chain_id: ctx.params.evm_chain_id as number | undefined,
    include_zero: ctx.params.include_zero as boolean | undefined,
    include_usd: ctx.params.include_usd as boolean | undefined,
  });
}

function handleAgentTransactions(ctx: QueryHandlerContext) {
  return queryAgentTransactions(ctx.privyUserId, {
    chainId: ctx.chainId,
    limit: ctx.params.limit as number | undefined,
    status: ctx.params.status as AgentTransactionStatus | undefined,
    category: ctx.params.category as AgentTransactionCategory | undefined,
    sessionId: ctx.params.session_id as string | undefined,
    transactionId: ctx.params.transaction_id as string | undefined,
  });
}

async function handleTokenResolve(ctx: QueryHandlerContext) {
  const symbol = String(
    ctx.params.symbol ?? ctx.params.token ?? ctx.params.input ?? "",
  ).trim();
  if (!symbol) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "token_resolve requires params.symbol (or token / input).",
    );
  }
  return queryTokenResolve(ctx.privyUserId, {
    chain_id: ctx.chainId,
    symbol,
    evm_chain_id: ctx.params.evm_chain_id as number | undefined,
    to_chain_id: ctx.params.to_chain_id as typeof ctx.chainId | undefined,
    to_evm_chain_id: ctx.params.to_evm_chain_id as number | undefined,
  });
}

async function handleBridgeCapabilities(ctx: QueryHandlerContext) {
  const fromChainId = ctx.params.from_chain_id as ChainId | undefined;
  const toChainId = ctx.params.to_chain_id as ChainId | undefined;
  if (!fromChainId || !toChainId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "bridge_capabilities requires params.from_chain_id and params.to_chain_id.",
    );
  }
  return queryBridgeCapabilities({
    from_chain_id: fromChainId,
    from_evm_chain_id: ctx.params.from_evm_chain_id as number | undefined,
    to_chain_id: toChainId,
    to_evm_chain_id: ctx.params.to_evm_chain_id as number | undefined,
    from_token: ctx.params.from_token as string | undefined,
  });
}

const CORE_QUERY_HANDLERS: Record<string, ChainQueryHandler> = {
  balance: handleBalance,
  native_balance: handleBalance,
  token_balances: handleTokenBalances,
  agent_transactions: handleAgentTransactions,
  token_resolve: handleTokenResolve,
  bridge_capabilities: handleBridgeCapabilities,
  supported_chains: async () => querySupportedChains(),
};

export function isCoreQueryType(query: string): query is (typeof CORE_QUERY_TYPES)[number] {
  return (CORE_QUERY_TYPES as readonly string[]).includes(query);
}

export function getCoreQueryHandler(query: string): ChainQueryHandler | null {
  return CORE_QUERY_HANDLERS[query] ?? null;
}

export const coreQueryRegistration = {
  chainIds: ["sui", "ethereum", "solana", "stellar"] as const,
  queryTypes: CORE_QUERY_TYPES,
  handler: async (ctx: QueryHandlerContext) => {
    const handler = getCoreQueryHandler(ctx.query);
    if (!handler) {
      throw new AppError(400, "UNSUPPORTED_QUERY", `Unsupported core query: ${ctx.query}`);
    }
    return handler(ctx);
  },
  schema: {
    queryTypes: CORE_QUERY_TYPES,
    description: CORE_QUERY_SCHEMA.description,
    paramsDescription: CORE_QUERY_SCHEMA.paramsDescription,
  },
};
