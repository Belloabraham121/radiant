import { getSquidConfig, isSquidEnabled, squidSlippageFromFraction } from "../../../config/squid.js";
import { AppError } from "../../../errors/app-error.js";
import type { CrossChainRouteOption } from "../cross-chain/cross-chain.types.js";
import { radiantToSquidChainId, toSquidTokenAddress } from "./squid-chain-map.js";
import { squidSdk } from "./squid.client.js";
import { storeSquidRoute } from "./squid-cache.js";
import { resolveSquidTokens, type ResolvedSquidChainPair } from "./squid-input.js";
import { createSquidRouteId, normalizeSquidRouteOption } from "./squid-normalize.js";
import { consumeSquidQuoteQuota } from "./squid-rate-limit.js";
import type { SquidQuoteInput, SquidStoredRoutePayload } from "./squid.types.js";
import { resolveSquidWalletAddresses } from "./squid-wallet-addresses.js";

/** SDK quote + normalize + route store — testable without wallet resolution. */
export async function fetchSquidRouteQuote(input: {
  tokens: ResolvedSquidChainPair;
  amountAtomic: string;
  fromAddress: string;
  toAddress: string;
  slippage?: number;
  quoteOnly?: boolean;
}): Promise<CrossChainRouteOption> {
  const config = getSquidConfig();
  const { tokens, amountAtomic, fromAddress, toAddress } = input;

  const routeSeed = JSON.stringify({
    from_chain_id: tokens.from.chain_id,
    to_chain_id: tokens.to.chain_id,
    from_evm_chain_id:
      tokens.from.chain_id === "ethereum" ? tokens.from.evm_chain_id : undefined,
    to_evm_chain_id: tokens.to.chain_id === "ethereum" ? tokens.to.evm_chain_id : undefined,
    from_token: tokens.fromSymbol,
    to_token: tokens.toSymbol,
    amount_atomic: amountAtomic,
    from_address: fromAddress,
    to_address: toAddress,
    slippage: input.slippage ?? config.defaultSlippage,
  });

  const response = await squidSdk.getRoute({
    fromChain: radiantToSquidChainId(tokens.from),
    toChain: radiantToSquidChainId(tokens.to),
    fromToken: toSquidTokenAddress(tokens.fromToken, tokens.from),
    toToken: toSquidTokenAddress(tokens.toToken, tokens.to),
    fromAmount: amountAtomic,
    fromAddress,
    toAddress,
    slippage: squidSlippageFromFraction(input.slippage ?? config.defaultSlippage),
    quoteOnly: input.quoteOnly ?? true,
  });

  if (!response.route?.quoteId) {
    throw new AppError(404, "SQUID_NO_ROUTE", "No route found for this transfer.");
  }

  const routeId = createSquidRouteId(routeSeed);
  const normalized = normalizeSquidRouteOption({
    response,
    from: tokens.from,
    to: tokens.to,
    fromTokenSymbol: tokens.fromSymbol,
    toTokenSymbol: tokens.toSymbol,
    routeId,
  });

  const stored: SquidStoredRoutePayload = {
    route: response.route,
    quote_id: response.route.quoteId,
    request_id: response.requestId,
    integrator_id: response.integratorId,
    from_chain_id: tokens.from.chain_id,
    to_chain_id: tokens.to.chain_id,
    from_evm_chain_id:
      tokens.from.chain_id === "ethereum" ? tokens.from.evm_chain_id : undefined,
    to_evm_chain_id: tokens.to.chain_id === "ethereum" ? tokens.to.evm_chain_id : undefined,
    from_squid_chain_id: radiantToSquidChainId(tokens.from),
    to_squid_chain_id: radiantToSquidChainId(tokens.to),
  };
  await storeSquidRoute(routeId, stored);

  return normalized;
}

/** Single best Squid route via SDK `getRoute` — no quote dedupe cache. */
export async function getSquidRoute(
  privyUserId: string,
  input: SquidQuoteInput,
): Promise<CrossChainRouteOption> {
  if (!isSquidEnabled()) {
    throw new AppError(503, "SQUID_UNAVAILABLE", "Squid is not enabled on this deployment.");
  }

  await consumeSquidQuoteQuota(privyUserId);

  const tokens = resolveSquidTokens({
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
    throw new AppError(
      400,
      "AMOUNT_REQUIRED",
      "How much should they bridge? Ask for the amount before quoting.",
    );
  }

  const { fromAddress, toAddress } = await resolveSquidWalletAddresses(
    privyUserId,
    tokens.from,
    tokens.to,
    { fromAddress: input.from_address, toAddress: input.to_address },
  );

  return fetchSquidRouteQuote({
    tokens,
    amountAtomic,
    fromAddress,
    toAddress,
    slippage: input.slippage,
    quoteOnly: input.quote_only,
  });
}
