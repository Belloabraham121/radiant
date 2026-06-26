import { AppError } from "../../errors/app-error.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { PendingTransaction } from "../agent/agent.types.js";
import {
  acceptLiquidityFallback,
  rejectLiquidityFallback,
} from "../defi/cross-chain/cross-chain-fallback.service.js";
import type { CrossChainRouteOption } from "../defi/cross-chain/cross-chain.types.js";
import { applySquidRouteToExecuteParams } from "../agent-transaction/approval-preview/enrichers/squid-route-params.js";
import { createPendingTransaction } from "../agent/transaction-approval.service.js";

function pickBestRoute(routes: CrossChainRouteOption[]): CrossChainRouteOption | null {
  if (routes.length === 0) {
    return null;
  }

  let best = routes[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const route of routes) {
    const fee = route.fee_cost_usd ?? 0;
    const gas = route.gas_cost_usd ?? 0;
    const score = fee + gas;
    if (score < bestScore) {
      bestScore = score;
      best = route;
    }
  }

  return best;
}

function crossChainOptionToExecuteInput(route: CrossChainRouteOption): ExecuteTransactionInput {
  if (route.provider_id !== "evm-squid" || route.provider_payload.kind !== "squid") {
    throw new AppError(500, "INTERNAL_ERROR", "Expected Squid route after liquidity fallback accept.");
  }

  const baseParams = {
    route_id: route.route_id,
    provider_id: route.provider_id,
    from_token: route.from_token_symbol,
    to_token: route.to_token_symbol,
    from_token_symbol: route.from_token_symbol,
    to_token_symbol: route.to_token_symbol,
    from_amount_atomic: route.from_amount_atomic,
    to_amount_atomic: route.to_amount_atomic,
    from_chain_id: route.from_chain_id,
    to_chain_id: route.to_chain_id,
    from_evm_chain_id: route.from_evm_chain_id,
    to_evm_chain_id: route.to_evm_chain_id,
    bridges: route.bridges,
    fee_cost_usd: route.fee_cost_usd,
    gas_cost_usd: route.gas_cost_usd,
    expires_at: route.expires_at,
    quote_expires_at: route.expires_at,
    quote_id: route.provider_payload.quote_id,
    request_id: route.provider_payload.request_id,
  };

  const params = applySquidRouteToExecuteParams(baseParams, route.provider_payload.squid_route, {
    from_chain_id: route.from_chain_id,
    to_chain_id: route.to_chain_id,
    from_evm_chain_id: route.from_evm_chain_id,
    to_evm_chain_id: route.to_evm_chain_id,
    from_token_symbol: route.from_token_symbol,
    to_token_symbol: route.to_token_symbol,
    bridges: route.bridges,
  });

  return {
    chain_id: route.from_chain_id,
    action: "cross_chain_swap",
    params,
  };
}

export type AcceptLiquidityFallbackApiResult = {
  status: "approval_required";
  pending: PendingTransaction;
  agent_transaction_id: string;
};

export type RejectLiquidityFallbackApiResult = {
  status: "rejected";
  fallback_offer_id: string;
};

/** User accepted Squid liquidity fallback — fetch route and queue bridge approval. */
export async function acceptLiquidityFallbackForApproval(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<AcceptLiquidityFallbackApiResult> {
  const routesResult = await acceptLiquidityFallback(privyUserId, fallbackOfferId);
  const best = pickBestRoute(routesResult.routes);
  if (!best) {
    throw new AppError(404, "SQUID_NO_ROUTE", "No alternate route found for this transfer.");
  }

  const executeInput = crossChainOptionToExecuteInput(best);
  const pending = await createPendingTransaction(privyUserId, executeInput);

  return {
    status: "approval_required",
    pending,
    agent_transaction_id: pending.id,
  };
}

/** User declined Squid liquidity fallback offer. */
export async function rejectLiquidityFallbackForApproval(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<RejectLiquidityFallbackApiResult> {
  await rejectLiquidityFallback(privyUserId, fallbackOfferId);
  return {
    status: "rejected",
    fallback_offer_id: fallbackOfferId,
  };
}
