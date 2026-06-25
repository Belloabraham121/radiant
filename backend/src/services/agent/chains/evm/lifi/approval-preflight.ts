import type { Route } from "@lifi/types";
import type { ExecuteTransactionInput } from "../../../../chains/types.js";
import type { ExecutePreflightRegistration } from "../../types.js";
import { isLifiExecuteAction } from "./execute-actions.js";
import { isExecutableLifiRoute } from "../../../../defi/lifi/lifi-normalize.js";
import { resolveLifiRouteForExecute } from "../../../../defi/lifi/lifi-quote.service.js";
import {
  assertEvmWalletFundedForSpend,
  buildLifiSpendRequirement,
} from "../../../../defi/preflight/evm-balance-preflight.js";

async function resolveRouteForPreflight(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<Route | null> {
  const embedded = params.lifi_route ?? params.route;
  if (isExecutableLifiRoute(embedded)) {
    return embedded;
  }

  const routeId = typeof params.route_id === "string" ? params.route_id : undefined;
  if (!routeId) {
    return null;
  }

  try {
    return await resolveLifiRouteForExecute({
      routeId,
      route: typeof params.route === "object" ? (params.route as Record<string, unknown>) : undefined,
      lifiRoute:
        typeof params.lifi_route === "object"
          ? (params.lifi_route as Record<string, unknown>)
          : undefined,
      privyUserId,
      snapshotParams: params,
    });
  } catch {
    return null;
  }
}

/** Balance + gas check before queueing or executing Li-Fi EVM actions. */
export async function preflightLifiExecuteBalance(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<void> {
  if (!isLifiExecuteAction(input.action)) {
    return;
  }

  const route = await resolveRouteForPreflight(privyUserId, input.params);
  const requirement = buildLifiSpendRequirement({
    action: input.action,
    params: input.params,
    route,
  });

  if (!requirement) {
    return;
  }

  await assertEvmWalletFundedForSpend(privyUserId, requirement);
}

// No preflight expiry check for Li-Fi bridge actions — the raw agent params carry the
// expires_at from when cross_chain_routes was called (60 s window), which can be stale
// by the time the agent submits execute_transaction. The enrichers in
// buildPendingTransactionPreview and approvePendingTransaction set a fresh expires_at
// from the stored route, and the expiry check in approvePendingTransaction runs on that
// enriched value. Checking raw params here produces false-positive "Quote expired" errors.
export const lifiPreflightHooks: readonly ExecutePreflightRegistration[] = [
  {
    match: (action) => action === "cross_chain_swap",
    run: async (privyUserId, input) => preflightLifiExecuteBalance(privyUserId, input),
  },
  {
    match: (action) => action === "lifi_approve",
    run: async (privyUserId, input) => preflightLifiExecuteBalance(privyUserId, input),
  },
];
