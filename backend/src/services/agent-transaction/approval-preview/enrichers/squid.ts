import type { ExecuteTransactionInput } from "../../../chains/types.js";
import { isDeFiQuoteFresh } from "../quote-expiry.js";
import { isExecutableSquidRoute } from "../../../defi/squid/squid-normalize.js";
import {
  applySquidRouteToExecuteParams,
  isSquidApprovalDisplayComplete,
  resolveSquidApprovalParams,
} from "./squid-route-params.js";

export function isSquidCrossChainRoute(params: Record<string, unknown>): boolean {
  const providerId = params.provider_id;
  if (providerId === "evm-squid") {
    return true;
  }
  const routeId = params.route_id;
  return typeof routeId === "string" && routeId.startsWith("squid:");
}

/** Attach Squid cross-chain quote display fields before showing the approval dialog. */
export async function enrichSquidExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: { requoteOnCacheMiss?: boolean },
): Promise<ExecuteTransactionInput> {
  if (input.action !== "cross_chain_swap" || !isSquidCrossChainRoute(input.params)) {
    return input;
  }

  const embeddedRoute = input.params.squid_route;
  const hasStoredRoute = isExecutableSquidRoute(embeddedRoute);
  if (
    hasStoredRoute &&
    isDeFiQuoteFresh(input.params) &&
    isSquidApprovalDisplayComplete(input.params)
  ) {
    if (isExecutableSquidRoute(input.params.squid_route)) {
      return input;
    }
    return {
      ...input,
      params: applySquidRouteToExecuteParams(input.params, embeddedRoute),
    };
  }

  const params = await resolveSquidApprovalParams(input.params, {
    privyUserId,
    requoteOnCacheMiss: options?.requoteOnCacheMiss ?? true,
  });
  return { ...input, params };
}
