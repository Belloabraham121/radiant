import type { ExecuteTransactionInput } from "../chains/types.js";
import type { CrossChainRouteOption, LiquidityFallbackOffer } from "../defi/cross-chain/cross-chain.types.js";
import {
  createLiquidityFallbackPendingTransaction,
} from "./transaction-approval.service.js";
import type { ExecuteTransactionContext } from "./execute-transaction-context.js";

export const LIQUIDITY_FALLBACK_BRIDGE_REPLY =
  "Li-Fi couldn't find liquidity for this bridge. I can check another route provider — confirm in the dialog when it appears.";

export const LIQUIDITY_FALLBACK_SWAP_REPLY =
  "Li-Fi couldn't find liquidity for this swap. I can check another route provider — confirm in the dialog when it appears.";

/** Below this USD size, prefer routes without source-chain DEX hops (they often revert on-chain). */
export const SMALL_CROSS_CHAIN_USD_THRESHOLD = 10;

/** Hard floor for cross-chain bridges that still require a source swap step. */
export const MIN_CROSS_CHAIN_SWAP_ROUTE_USD = 5;

export type PickBestCrossChainRouteOptions = {
  /** When true, pick among routes with no source-chain exchange steps first. */
  preferDirectRoutes?: boolean;
  /** When true, deprioritize Li-Fi feeCollection composer routes. */
  avoidFeeCollection?: boolean;
};

export function crossChainRouteHasFeeCollection(route: CrossChainRouteOption): boolean {
  if (route.bridges.includes("feeCollection") || route.exchanges.includes("feeCollection")) {
    return true;
  }
  if (route.provider_payload.kind !== "lifi") {
    return false;
  }
  for (const step of route.provider_payload.lifi_route.steps) {
    if (step.tool === "feeCollection") {
      return true;
    }
    if (step.includedSteps?.some((included) => included.tool === "feeCollection")) {
      return true;
    }
  }
  return false;
}

export function pickBestCrossChainRoute(
  routes: CrossChainRouteOption[],
  options?: PickBestCrossChainRouteOptions,
): CrossChainRouteOption | null {
  if (routes.length === 0) {
    return null;
  }

  let candidates = routes;
  if (options?.avoidFeeCollection) {
    const withoutFee = routes.filter((route) => !crossChainRouteHasFeeCollection(route));
    if (withoutFee.length > 0) {
      candidates = withoutFee;
    }
  }
  if (options?.preferDirectRoutes) {
    const direct = candidates.filter((route) => route.exchanges.length === 0);
    if (direct.length > 0) {
      candidates = direct;
    }
  }

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const route of candidates) {
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

export function isSmallCrossChainUsdAmount(usdAmount: number | undefined): boolean {
  return usdAmount !== undefined && usdAmount < SMALL_CROSS_CHAIN_USD_THRESHOLD;
}

export function crossChainRouteNeedsSourceSwap(route: CrossChainRouteOption): boolean {
  return route.exchanges.some((tool) => tool !== "feeCollection");
}

export function buildCrossChainSwapParams(route: CrossChainRouteOption): Record<string, unknown> {
  return {
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
    expires_at: route.expires_at,
  };
}

export function buildCrossChainExecuteInputFromOffer(
  offer: LiquidityFallbackOffer,
): ExecuteTransactionInput {
  return {
    chain_id: offer.from_chain_id,
    ...(offer.from_evm_chain_id !== undefined ? { evm_chain_id: offer.from_evm_chain_id } : {}),
    action: "cross_chain_swap",
    params: {
      from_chain_id: offer.from_chain_id,
      to_chain_id: offer.to_chain_id,
      from_evm_chain_id: offer.from_evm_chain_id,
      to_evm_chain_id: offer.to_evm_chain_id,
      from_token: offer.from_token,
      to_token: offer.to_token,
      from_token_symbol: offer.from_token,
      to_token_symbol: offer.to_token,
      from_amount_atomic: offer.amount_atomic,
      confirm_same_token: offer.confirm_same_token,
    },
  };
}

export async function createPendingFromLiquidityFallbackOffer(
  privyUserId: string,
  offer: LiquidityFallbackOffer,
  context?: ExecuteTransactionContext,
) {
  const executeInput = buildCrossChainExecuteInputFromOffer(offer);
  return createLiquidityFallbackPendingTransaction(privyUserId, executeInput, offer, context);
}
