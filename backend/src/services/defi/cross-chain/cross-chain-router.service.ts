import { isSquidEnabled } from "../../../config/squid.js";
import { AppError } from "../../../errors/app-error.js";
import { getLifiAdvancedRoutes } from "../lifi/lifi-routes.service.js";
import { mapLifiError } from "../lifi/lifi.errors.js";
import type { CrossChainRoutesResult as LifiCrossChainRoutesResult, LifiRoutesInput } from "../lifi/lifi.types.js";
import { resolveLifiRouteForExecute } from "../lifi/lifi-quote.service.js";
import { resolveSquidRouteForExecute } from "../squid/squid-quote.service.js";
import { buildLiquidityFallbackOffer } from "./cross-chain-fallback.service.js";
import { isLiquidityFallbackEligible } from "./cross-chain-fallback.js";
import { mapLifiRouteToCrossChainOption, stripLifiRouteIdPrefix } from "./cross-chain-lifi-adapter.js";
import type { CrossChainRoutesResult, ResolvedCrossChainRoute } from "./cross-chain.types.js";

type GetLifiAdvancedRoutesFn = typeof getLifiAdvancedRoutes;

let getLifiAdvancedRoutesOverride: GetLifiAdvancedRoutesFn | null = null;

export function setGetLifiAdvancedRoutesForTests(fn: GetLifiAdvancedRoutesFn | null): void {
  getLifiAdvancedRoutesOverride = fn;
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
