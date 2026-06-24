import { getLifiConfig, isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { convertQuoteToRoute } from "@lifi/sdk";
import type { Route } from "@lifi/types";
import {
  evmChainIdToLifiChainId,
  formatAtomicAmount,
  toLifiTokenAddress,
} from "./lifi-chain-map.js";
import { lifiSdk } from "./lifi.client.js";
import { getStoredLifiRoute, lifiCachedQuoteFetch, storeLifiRoute } from "./lifi-cache.js";
import { resolveLifiTokens } from "./lifi-input.js";
import { consumeLifiQuoteQuota } from "./lifi-rate-limit.js";
import { createRouteId, normalizeLifiStepToCrossChainQuote } from "./lifi-normalize.js";
import type { CrossChainQuote, LifiQuoteInput } from "./lifi.types.js";

async function resolveWalletAddress(privyUserId: string, fromAddress?: string): Promise<string> {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
  }

  if (fromAddress && fromAddress.toLowerCase() !== agentWallet.address.toLowerCase()) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "from_address must match the user's agent wallet.",
      { expected: agentWallet.address, received: fromAddress },
    );
  }

  return agentWallet.address;
}

export async function getLifiQuote(
  privyUserId: string,
  input: LifiQuoteInput,
): Promise<CrossChainQuote> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  await consumeLifiQuoteQuota(privyUserId);

  const config = getLifiConfig();
  const fromAddress = await resolveWalletAddress(privyUserId, input.from_address);
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
    slippage: input.slippage ?? config.defaultSlippage,
  };

  return lifiCachedQuoteFetch(cacheParams, async () => {
    const step = await lifiSdk.getQuote({
      fromChain: evmChainIdToLifiChainId(input.from_evm_chain_id),
      toChain: evmChainIdToLifiChainId(input.to_evm_chain_id),
      fromToken: toLifiTokenAddress(tokens.fromToken),
      toToken: toLifiTokenAddress(tokens.toToken),
      fromAddress,
      fromAmount: input.amount_atomic,
      slippage: input.slippage ?? config.defaultSlippage,
      integrator: input.integrator ?? config.integrator,
    });

    const routeId = createRouteId(JSON.stringify(cacheParams));
    const route = convertQuoteToRoute(step);
    await storeLifiRoute(routeId, { ...route, id: routeId });

    return normalizeLifiStepToCrossChainQuote({
      step,
      fromEvmChainId: input.from_evm_chain_id,
      toEvmChainId: input.to_evm_chain_id,
      fromTokenSymbol: tokens.fromSymbol,
      toTokenSymbol: tokens.toSymbol,
      routeId,
    });
  });
}

export async function resolveLifiRouteForExecute(input: {
  routeId?: string;
  route?: Record<string, unknown>;
}): Promise<Route> {
  if (input.route) {
    return input.route as unknown as Route;
  }

  if (input.routeId) {
    const stored = await getStoredLifiRoute(input.routeId);
    if (stored) {
      return stored;
    }
    throw new AppError(404, "LIFI_NO_ROUTE", "Route expired or not found. Fetch a fresh quote.");
  }

  throw new AppError(400, "VALIDATION_ERROR", "Provide route_id or route from a prior quote.");
}

export function buildQuoteRefreshParams(route: Route, fromAddress: string) {
  const firstStep = route.steps[0];
  if (!firstStep) {
    throw new AppError(400, "LIFI_NO_ROUTE", "Route has no steps.");
  }

  return {
    fromChain: firstStep.action.fromChainId,
    toChain: firstStep.action.toChainId,
    fromToken: firstStep.action.fromToken.address,
    toToken: firstStep.action.toToken.address,
    fromAddress,
    fromAmount: route.fromAmount,
    slippage: getLifiConfig().defaultSlippage,
    integrator: getLifiConfig().integrator,
  };
}

export { formatAtomicAmount };
