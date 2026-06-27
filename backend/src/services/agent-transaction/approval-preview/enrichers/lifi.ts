import type { ExecuteTransactionInput } from "../../../chains/types.js";
import {
  isLifiExecuteAction,
} from "../../../agent/chains/evm/lifi/execute-actions.js";
import { AppError } from "../../../../errors/app-error.js";
import { isDeFiQuoteFresh, isLifiContinuationApproval } from "../quote-expiry.js";
import { isExecutableLifiRoute } from "../../../defi/lifi/lifi-normalize.js";
import {
  isLifiRouteContinuation,
  markLifiContinuationParams,
} from "../../../defi/lifi/lifi-continuation.js";
import {
  applyLifiRouteToExecuteParams,
  isLifiApprovalDisplayComplete,
  resolveLifiApprovalParams,
} from "./lifi-route-params.js";

export function matchLifiExecuteInput(input: ExecuteTransactionInput): boolean {
  return isLifiExecuteAction(input.action);
}

function hasNoRouteReference(params: Record<string, unknown>): boolean {
  return (
    !params.route_id &&
    !params.route &&
    !params.lifi_route
  );
}

function hasNoTokenInfo(params: Record<string, unknown>): boolean {
  return (
    !params.from_token_symbol &&
    !params.from_token &&
    !params.from_chain_id &&
    !params.to_chain_id
  );
}

/** Attach cross-chain quote display fields before showing the approval dialog. */
export async function enrichLifiExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: { requoteOnCacheMiss?: boolean; forceRequote?: boolean },
): Promise<ExecuteTransactionInput> {
  if (!matchLifiExecuteInput(input)) {
    return input;
  }

  if (input.action === "cross_chain_swap" && hasNoRouteReference(input.params) && hasNoTokenInfo(input.params)) {
    throw new AppError(
      400,
      "LIFI_NO_ROUTE",
      "No bridge route found. Run cross_chain_quote first to get a route, then pass the route_id and snapshot fields to cross_chain_swap.",
    );
  }

  const embeddedRoute = input.params.lifi_route ?? input.params.route;
  const hasStoredRoute = isExecutableLifiRoute(embeddedRoute);
  if (hasStoredRoute && isLifiRouteContinuation(embeddedRoute)) {
    return {
      ...input,
      params: applyLifiRouteToExecuteParams(
        markLifiContinuationParams(input.params),
        embeddedRoute,
      ),
    };
  }
  if (
    !options?.forceRequote &&
    hasStoredRoute &&
    isDeFiQuoteFresh(input.params) &&
    isLifiApprovalDisplayComplete(input.params)
  ) {
    if (isExecutableLifiRoute(input.params.lifi_route)) {
      return input;
    }
    return {
      ...input,
      params: applyLifiRouteToExecuteParams(input.params, embeddedRoute),
    };
  }

  const params = await resolveLifiApprovalParams(input.params, {
    privyUserId,
    requoteOnCacheMiss: options?.requoteOnCacheMiss ?? true,
    forceRequote: options?.forceRequote,
  });
  return { ...input, params };
}
