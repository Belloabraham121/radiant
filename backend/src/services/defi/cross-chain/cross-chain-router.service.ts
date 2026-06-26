import type { LifiChainRef } from "../../../config/lifi-chains.js";
import { isSquidEnabled } from "../../../config/squid.js";
import type { ChainId } from "../../chains/types.js";
import { AppError } from "../../../errors/app-error.js";
import { getLifiAdvancedRoutes } from "../lifi/lifi-routes.service.js";
import { mapLifiError } from "../lifi/lifi.errors.js";
import { normalizeLifiRouteToCrossChainQuote } from "../lifi/lifi-normalize.js";
import { getLifiCrossChainStatus } from "../lifi/lifi-status.service.js";
import type {
  CrossChainQuote,
  CrossChainRoutesResult as LifiCrossChainRoutesResult,
  CrossChainStatusResult,
  LifiQuoteInput,
  LifiRoutesInput,
} from "../lifi/lifi.types.js";
import { lifiStatusInputSchema } from "../lifi/lifi.types.js";
import { resolveLifiRouteForExecute } from "../lifi/lifi-quote.service.js";
import { getSquidCrossChainStatus } from "../squid/squid-status.service.js";
import { resolveSquidRouteForExecute } from "../squid/squid-quote.service.js";
import type { SquidCrossChainStatusResult } from "../squid/squid.types.js";
import { squidStatusInputSchema } from "../squid/squid.types.js";
import { buildLiquidityFallbackOffer } from "./cross-chain-fallback.service.js";
import { isLiquidityFallbackEligible } from "./cross-chain-fallback.js";
import { mapLifiRouteToCrossChainOption, stripLifiRouteIdPrefix } from "./cross-chain-lifi-adapter.js";
import type {
  CrossChainQuoteFallbackResult,
  CrossChainRouteOption,
  CrossChainRoutesResult,
  CrossChainStatusInput,
  ResolvedCrossChainRoute,
} from "./cross-chain.types.js";

export type CrossChainQuoteResult = CrossChainQuote | CrossChainQuoteFallbackResult;

type GetLifiAdvancedRoutesFn = typeof getLifiAdvancedRoutes;

let getLifiAdvancedRoutesOverride: GetLifiAdvancedRoutesFn | null = null;

type GetLifiCrossChainStatusFn = typeof getLifiCrossChainStatus;
type GetSquidCrossChainStatusFn = typeof getSquidCrossChainStatus;

let getLifiCrossChainStatusOverride: GetLifiCrossChainStatusFn | null = null;
let getSquidCrossChainStatusOverride: GetSquidCrossChainStatusFn | null = null;

export function setGetLifiAdvancedRoutesForTests(fn: GetLifiAdvancedRoutesFn | null): void {
  getLifiAdvancedRoutesOverride = fn;
}

export function setGetLifiCrossChainStatusForTests(fn: GetLifiCrossChainStatusFn | null): void {
  getLifiCrossChainStatusOverride = fn;
}

export function setGetSquidCrossChainStatusForTests(fn: GetSquidCrossChainStatusFn | null): void {
  getSquidCrossChainStatusOverride = fn;
}

function callGetLifiAdvancedRoutes(
  privyUserId: string,
  input: LifiRoutesInput,
): Promise<LifiCrossChainRoutesResult> {
  if (getLifiAdvancedRoutesOverride) {
    return getLifiAdvancedRoutesOverride(privyUserId, input);
  }
  return getLifiAdvancedRoutes(privyUserId, input);
}

async function buildNoRouteResult(
  privyUserId: string,
  input: LifiRoutesInput,
  unavailableRoutes: unknown,
  lifiError?: AppError,
): Promise<CrossChainRoutesResult> {
  if (!isSquidEnabled()) {
    if (lifiError) {
      throw lifiError;
    }
    throw new AppError(404, "LIFI_NO_ROUTE", "No route found for this transfer.");
  }

  const liquidity_fallback_offer = await buildLiquidityFallbackOffer(privyUserId, input, lifiError);
  return {
    routes: [],
    unavailable_routes: unavailableRoutes,
    liquidity_fallback_offer,
    routing: { primary: "evm-lifi", fallback: "evm-squid" },
  };
}

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

function toLifiChainRef(chainId: ChainId, evmChainId?: number): LifiChainRef {
  if (chainId === "ethereum") {
    if (evmChainId === undefined) {
      throw new AppError(400, "VALIDATION_ERROR", "EVM chain id is required for ethereum.");
    }
    return { chain_id: "ethereum", evm_chain_id: evmChainId };
  }
  if (chainId === "sui" || chainId === "solana") {
    return { chain_id: chainId };
  }
  throw new AppError(400, "UNSUPPORTED_CHAIN", `Cross-chain quote is not supported on ${chainId}.`);
}

function mapCrossChainOptionToQuote(route: CrossChainRouteOption): CrossChainQuote {
  if (route.provider_id !== "evm-lifi" || route.provider_payload.kind !== "lifi") {
    throw new AppError(500, "INTERNAL_ERROR", "Expected Li-Fi route for cross-chain quote.");
  }

  const from = toLifiChainRef(route.from_chain_id, route.from_evm_chain_id);
  const to = toLifiChainRef(route.to_chain_id, route.to_evm_chain_id);

  return normalizeLifiRouteToCrossChainQuote({
    route: route.provider_payload.lifi_route,
    from,
    to,
    fromTokenSymbol: route.from_token_symbol,
    toTokenSymbol: route.to_token_symbol,
    routeId: stripLifiRouteIdPrefix(route.route_id),
  });
}

function resolveStatusProvider(input: CrossChainStatusInput): "evm-lifi" | "evm-squid" {
  if (input.provider_id === "evm-squid") {
    return "evm-squid";
  }
  if (input.provider_id === "evm-lifi") {
    return "evm-lifi";
  }
  if (input.route_id?.startsWith("squid:")) {
    return "evm-squid";
  }
  if (input.transaction_id && input.quote_id) {
    return "evm-squid";
  }
  return "evm-lifi";
}

/** Li-Fi primary cross-chain routes; Squid only after explicit user consent via fallback offer. */
export async function getCrossChainRoutes(
  privyUserId: string,
  input: LifiRoutesInput,
): Promise<CrossChainRoutesResult> {
  try {
    const lifiResult = await callGetLifiAdvancedRoutes(privyUserId, input);

    if (lifiResult.routes.length > 0) {
      return {
        routes: lifiResult.routes.map(mapLifiRouteToCrossChainOption),
        unavailable_routes: lifiResult.unavailable_routes,
        routing: { primary: "evm-lifi" },
      };
    }

    return buildNoRouteResult(privyUserId, input, lifiResult.unavailable_routes);
  } catch (err) {
    const mapped = err instanceof AppError ? err : mapLifiError(err);
    if (isLiquidityFallbackEligible(mapped)) {
      return buildNoRouteResult(privyUserId, input, null, mapped);
    }
    throw mapped;
  }
}

/** Best Li-Fi cross-chain quote via router; returns fallback offer when Li-Fi has no liquidity. */
export async function getCrossChainQuote(
  privyUserId: string,
  input: LifiQuoteInput,
): Promise<CrossChainQuoteResult> {
  const routesResult = await getCrossChainRoutes(privyUserId, input);

  if (routesResult.routes.length > 0) {
    const best = pickBestRoute(routesResult.routes);
    if (!best) {
      throw new AppError(404, "LIFI_NO_ROUTE", "No route found for this transfer.");
    }
    return mapCrossChainOptionToQuote(best);
  }

  if (routesResult.liquidity_fallback_offer) {
    return {
      liquidity_fallback_offer: routesResult.liquidity_fallback_offer,
      unavailable_routes: routesResult.unavailable_routes,
      routing: routesResult.routing,
    };
  }

  throw new AppError(404, "LIFI_NO_ROUTE", "No route found for this transfer.");
}

export async function getCrossChainStatus(
  privyUserId: string,
  input: CrossChainStatusInput,
): Promise<CrossChainStatusResult | SquidCrossChainStatusResult> {
  const provider = resolveStatusProvider(input);

  if (provider === "evm-squid") {
    const squidInput = squidStatusInputSchema.parse({
      transaction_id: input.transaction_id,
      quote_id: input.quote_id,
      from_chain_id: input.from_chain_id,
      to_chain_id: input.to_chain_id,
      from_evm_chain_id: input.from_evm_chain_id,
      to_evm_chain_id: input.to_evm_chain_id,
      request_id: input.request_id,
      bridge_type: input.bridge_type,
    });
    if (getSquidCrossChainStatusOverride) {
      return getSquidCrossChainStatusOverride(privyUserId, squidInput);
    }
    return getSquidCrossChainStatus(privyUserId, squidInput);
  }

  const lifiInput = lifiStatusInputSchema.parse({
    tx_hash: input.tx_hash,
    from_chain_id: input.from_chain_id,
    to_chain_id: input.to_chain_id,
    from_evm_chain_id: input.from_evm_chain_id,
    to_evm_chain_id: input.to_evm_chain_id,
    bridge: input.bridge,
  });
  if (getLifiCrossChainStatusOverride) {
    return getLifiCrossChainStatusOverride(privyUserId, lifiInput);
  }
  return getLifiCrossChainStatus(privyUserId, lifiInput);
}

export async function resolveCrossChainRouteForExecute(input: {
  routeId: string;
  privyUserId?: string;
  snapshotParams?: Record<string, unknown>;
  lifiRoute?: Record<string, unknown>;
  squidRoute?: Record<string, unknown>;
}): Promise<ResolvedCrossChainRoute> {
  const { routeId } = input;

  if (routeId.startsWith("squid:")) {
    const payload = await resolveSquidRouteForExecute({
      routeId,
      privyUserId: input.privyUserId,
      snapshotParams: input.snapshotParams,
      squidRoute: input.squidRoute,
    });
    return { provider_id: "evm-squid", payload };
  }

  const bareRouteId = stripLifiRouteIdPrefix(routeId);
  const route = await resolveLifiRouteForExecute({
    routeId: bareRouteId,
    privyUserId: input.privyUserId,
    snapshotParams: input.snapshotParams,
    lifiRoute: input.lifiRoute,
  });
  return { provider_id: "evm-lifi", route };
}
