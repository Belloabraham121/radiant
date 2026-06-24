import { getLifiConfig, isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { evmChainIdToLifiChainId, toLifiTokenAddress } from "./lifi-chain-map.js";
import { lifiSdk } from "./lifi.client.js";
import { defiCachedFetch } from "../cache.js";
import { getDefiCacheConfig } from "../../../config/defi-cache.js";
import { lifiRoutesListCacheKey, storeLifiRoute } from "./lifi-cache.js";
import { resolveLifiTokens } from "./lifi-input.js";
import { consumeLifiQuoteQuota } from "./lifi-rate-limit.js";
import { createRouteId, normalizeLifiRouteOption } from "./lifi-normalize.js";
import type { CrossChainRoutesResult, LifiRoutesInput } from "./lifi.types.js";

async function resolveWalletAddress(privyUserId: string): Promise<string> {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
  }
  return agentWallet.address;
}

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
  const fromAddress = await resolveWalletAddress(privyUserId);
  const tokens = resolveLifiTokens({
    fromEvmChainId: input.from_evm_chain_id,
    toEvmChainId: input.to_evm_chain_id,
    fromToken: input.from_token,
    toToken: input.to_token,
  });

  const cacheParams = {
    from_evm_chain_id: input.from_evm_chain_id,
    to_evm_chain_id: input.to_evm_chain_id,
    from_token: tokens.fromSymbol,
    to_token: tokens.toSymbol,
    amount_atomic: input.amount_atomic,
    from_address: fromAddress,
    max_routes: input.max_routes ?? 3,
    slippage: input.slippage ?? config.defaultSlippage,
  };

  return defiCachedFetch(
    lifiRoutesListCacheKey(cacheParams),
    getDefiCacheConfig().quoteDedupeTtlSeconds,
    async () => {
      const response = await lifiSdk.getRoutes({
        fromChainId: evmChainIdToLifiChainId(input.from_evm_chain_id),
        toChainId: evmChainIdToLifiChainId(input.to_evm_chain_id),
        fromTokenAddress: toLifiTokenAddress(tokens.fromToken),
        toTokenAddress: toLifiTokenAddress(tokens.toToken),
        fromAddress,
        fromAmount: input.amount_atomic,
        options: {
          slippage: input.slippage ?? config.defaultSlippage,
          integrator: input.integrator ?? config.integrator,
          order: "RECOMMENDED",
        },
      });

      const routes = (response.routes ?? [])
        .slice(0, input.max_routes ?? 3)
        .map((route) => {
          const routeId = route.id ?? createRouteId(JSON.stringify(route));
          const normalized = normalizeLifiRouteOption({
            route: { ...route, id: routeId },
            fromEvmChainId: input.from_evm_chain_id,
            toEvmChainId: input.to_evm_chain_id,
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
}
