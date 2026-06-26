import { getLifiConfig, isLifiEnabled, lifiIntegratorSdkFields } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveLifiBridgeWalletAddresses } from "./lifi-wallet-addresses.js";
import { radiantToLifiChainId, toLifiTokenAddress } from "./lifi-chain-map.js";
import { lifiSdk } from "./lifi.client.js";
import { defiCachedFetch } from "../cache.js";
import { getDefiCacheConfig } from "../../../config/defi-cache.js";
import { lifiRoutesListCacheKey, storeLifiRoute } from "./lifi-cache.js";
import { resolveLifiTokens } from "./lifi-input.js";
import { consumeLifiQuoteQuota } from "./lifi-rate-limit.js";
import { createRouteId, normalizeLifiRouteOption, LIFI_QUOTE_TTL_MS } from "./lifi-normalize.js";
import type { CrossChainRoutesResult, LifiRoutesInput } from "./lifi.types.js";

/** Multi-bridge route comparison via SDK `getRoutes`. */
export async function getLifiAdvancedRoutes(
  privyUserId: string,
  input: LifiRoutesInput,
): Promise<CrossChainRoutesResult> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  await consumeLifiQuoteQuota(privyUserId);

  const config = getLifiConfig();
  const tokens = resolveLifiTokens({
    from_chain_id: input.from_chain_id,
    to_chain_id: input.to_chain_id,
    from_evm_chain_id: input.from_evm_chain_id,
    to_evm_chain_id: input.to_evm_chain_id,
    fromToken: input.from_token ?? "",
    toToken: input.to_token ?? "",
    amountAtomic: input.amount_atomic,
    confirmSameToken: input.confirm_same_token,
  });
  const amountAtomic = input.amount_atomic;
  if (!amountAtomic) {
    throw new AppError(400, "AMOUNT_REQUIRED", "How much should they bridge? Ask for the amount before quoting.");
  }
  const { fromAddress, toAddress } = await resolveLifiBridgeWalletAddresses(
    privyUserId,
    tokens.from,
    tokens.to,
  );

  const cacheParams = {
    from_chain_id: tokens.from.chain_id,
    to_chain_id: tokens.to.chain_id,
    from_evm_chain_id:
      tokens.from.chain_id === "ethereum" ? tokens.from.evm_chain_id : undefined,
    to_evm_chain_id: tokens.to.chain_id === "ethereum" ? tokens.to.evm_chain_id : undefined,
    from_token: tokens.fromSymbol,
    to_token: tokens.toSymbol,
    amount_atomic: input.amount_atomic,
    from_address: fromAddress,
    to_address: toAddress,
    max_routes: input.max_routes ?? 3,
    slippage: input.slippage ?? config.defaultSlippage,
    waive_integrator_fee: input.waive_integrator_fee ?? false,
  };

  const result = await defiCachedFetch(
    lifiRoutesListCacheKey(cacheParams),
    getDefiCacheConfig().quoteDedupeTtlSeconds,
    async () => {
      const response = await lifiSdk.getRoutes({
        fromChainId: radiantToLifiChainId(tokens.from),
        toChainId: radiantToLifiChainId(tokens.to),
        fromTokenAddress: toLifiTokenAddress(tokens.fromToken, tokens.from),
        toTokenAddress: toLifiTokenAddress(tokens.toToken, tokens.to),
        fromAddress,
        toAddress,
        fromAmount: amountAtomic,
        options: {
          slippage: input.slippage ?? config.defaultSlippage,
          ...lifiIntegratorSdkFields(config, input.integrator, {
            waiveFee: input.waive_integrator_fee,
          }),
          order: "RECOMMENDED",
        },
      });

      const routes = (response.routes ?? [])
        .slice(0, input.max_routes ?? 3)
        .map((route) => {
          const routeId = route.id ?? createRouteId(JSON.stringify(route));
          const normalized = normalizeLifiRouteOption({
            route: { ...route, id: routeId },
            from: tokens.from,
            to: tokens.to,
            fromTokenSymbol: tokens.fromSymbol,
            toTokenSymbol: tokens.toSymbol,
          });
          void storeLifiRoute(routeId, normalized.lifi_route);
          return normalized;
        });

      return {
        routes,
        unavailable_routes: response.unavailableRoutes ?? null,
      };
    },
  );

  // Re-stamp expires_at on each route so cached results always give the agent a fresh
  // 60-second window from the moment this response is returned, not from when the
  // cached entry was originally created.
  const freshExpiresAt = new Date(Date.now() + LIFI_QUOTE_TTL_MS).toISOString();
  return {
    ...result,
    routes: result.routes.map((r) => ({ ...r, expires_at: freshExpiresAt })),
  };
}
