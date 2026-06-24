import { getLifiConfig, isLifiEnabled, lifiIntegratorSdkFields } from "../../../config/lifi.js";
import { resolveLifiChainRef } from "../../../config/lifi-chains.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { convertQuoteToRoute } from "@lifi/sdk";
import type { Route } from "@lifi/types";
import type { ChainId } from "../../chains/types.js";
import {
  formatAtomicAmount,
  lifiToRadiantChainRef,
  radiantToLifiChainId,
  toLifiTokenAddress,
  type LifiChainRef,
} from "./lifi-chain-map.js";
import { lifiSdk } from "./lifi.client.js";
import { getStoredLifiRoute, lifiCachedQuoteFetch, storeLifiRoute } from "./lifi-cache.js";
import { resolveLifiTokens } from "./lifi-input.js";
import { consumeLifiQuoteQuota } from "./lifi-rate-limit.js";
import { createRouteId, normalizeLifiStepToCrossChainQuote } from "./lifi-normalize.js";
import type { CrossChainQuote, LifiQuoteInput } from "./lifi.types.js";

function addressesMatch(chainId: ChainId, expected: string, received: string): boolean {
  if (chainId === "ethereum") {
    return expected.toLowerCase() === received.toLowerCase();
  }
  return expected === received;
}

async function resolveWalletAddress(
  privyUserId: string,
  chainRef: LifiChainRef,
  fromAddress?: string,
): Promise<string> {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, chainRef.chain_id);
  if (!agentWallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `Agent wallet not registered for chain ${chainRef.chain_id}.`,
    );
  }

  if (fromAddress && !addressesMatch(chainRef.chain_id, agentWallet.address, fromAddress)) {
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
  const tokens = resolveLifiTokens({
    from_chain_id: input.from_chain_id,
    to_chain_id: input.to_chain_id,
    from_evm_chain_id: input.from_evm_chain_id,
    to_evm_chain_id: input.to_evm_chain_id,
    fromToken: input.from_token,
    toToken: input.to_token,
  });

  const fromAddress = await resolveWalletAddress(privyUserId, tokens.from, input.from_address);
  const fromLifiChainId = radiantToLifiChainId(tokens.from);
  const toLifiChainId = radiantToLifiChainId(tokens.to);

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
    slippage: input.slippage ?? config.defaultSlippage,
  };

  return lifiCachedQuoteFetch(cacheParams, async () => {
    const step = await lifiSdk.getQuote({
      fromChain: fromLifiChainId,
      toChain: toLifiChainId,
      fromToken: toLifiTokenAddress(tokens.fromToken, tokens.from),
      toToken: toLifiTokenAddress(tokens.toToken, tokens.to),
      fromAddress,
      fromAmount: input.amount_atomic,
      slippage: input.slippage ?? config.defaultSlippage,
      ...lifiIntegratorSdkFields(config, input.integrator),
    });

    const routeId = createRouteId(JSON.stringify(cacheParams));
    const route = convertQuoteToRoute(step);
    await storeLifiRoute(routeId, { ...route, id: routeId });

    return normalizeLifiStepToCrossChainQuote({
      step,
      from: tokens.from,
      to: tokens.to,
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

  const config = getLifiConfig();
  return {
    fromChain: firstStep.action.fromChainId,
    toChain: firstStep.action.toChainId,
    fromToken: firstStep.action.fromToken.address,
    toToken: firstStep.action.toToken.address,
    fromAddress,
    fromAmount: route.fromAmount,
    slippage: config.defaultSlippage,
    ...lifiIntegratorSdkFields(config),
  };
}

export function resolveSourceChainFromExecuteInput(input: {
  from_chain_id?: ChainId;
  from_evm_chain_id?: number;
  route?: Route;
}): LifiChainRef {
  if (input.from_chain_id || input.from_evm_chain_id !== undefined) {
    return resolveLifiChainRef({
      chain_id: input.from_chain_id,
      evm_chain_id: input.from_evm_chain_id,
    });
  }

  const firstStep = input.route?.steps[0];
  if (firstStep) {
    return lifiToRadiantChainRef(firstStep.action.fromChainId);
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Unable to determine source chain for Li-Fi execute.",
  );
}

export { formatAtomicAmount };
