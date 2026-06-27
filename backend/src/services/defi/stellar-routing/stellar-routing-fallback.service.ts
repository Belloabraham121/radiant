import { randomUUID } from "node:crypto";
import { isSoroswapEnabled } from "../../../config/soroswap.js";
import { AppError } from "../../../errors/app-error.js";
import { getChainsForToken, isTokenOnChain } from "../../agent/swap/token-chain-affinity.js";
import type { PartialSwapIntent } from "../../agent/swap/swap-intent.types.js";
import type { ChainId } from "../../chains/types.js";
import { getSoroswapQuote } from "../soroswap/soroswap-quote.service.js";
import { logStellarRoutingFallbackAcceptedTotal } from "../soroswap/soroswap-observability.service.js";
import {
  STELLAR_ROUTING_FALLBACK_TTL_SECONDS,
  getStellarRoutingFallbackOffer,
  storeStellarRoutingFallbackOffer,
  transitionStellarRoutingFallbackOfferStatus,
} from "./stellar-routing-fallback-cache.js";
import type {
  StellarRoutingFallbackIntent,
  StellarRoutingFallbackOffer,
  StellarRoutingFallbackQuoteParams,
  StellarRoutingFallbackQuoteResult,
  StoredStellarRoutingFallbackOffer,
} from "./stellar-routing.types.js";

const OFFER_TTL_MS = STELLAR_ROUTING_FALLBACK_TTL_SECONDS * 1000;

type GetSoroswapQuoteFn = typeof getSoroswapQuote;

let getSoroswapQuoteOverride: GetSoroswapQuoteFn | null = null;

export function setGetSoroswapQuoteForTests(fn: GetSoroswapQuoteFn | null): void {
  getSoroswapQuoteOverride = fn;
}

function callGetSoroswapQuoteForFallback(
  privyUserId: string,
  input: StellarRoutingFallbackQuoteParams,
): Promise<Awaited<ReturnType<typeof getSoroswapQuote>>> {
  if (getSoroswapQuoteOverride) {
    return getSoroswapQuoteOverride(privyUserId, input);
  }
  return getSoroswapQuote(privyUserId, input, { source: "routing_fallback" });
}

function tokenOnlyOnStellar(symbol: string): boolean {
  const chains = getChainsForToken(symbol);
  return chains.length === 1 && chains[0]?.chainId === "stellar";
}

/** True when both tokens are Stellar-only but the selected chain is not Stellar. */
export function detectStellarRoutingFallback(intent: PartialSwapIntent): boolean {
  const inputCoin = intent.inputCoin?.trim();
  const outputCoin = intent.outputCoin?.trim();
  if (!inputCoin || !outputCoin) {
    return false;
  }

  const selectedChain = intent.chainId;
  if (!selectedChain) {
    return false;
  }
  const selectedEvm = intent.evmChainId;
  if (selectedChain === "stellar") {
    return false;
  }

  if (tokenOnlyOnStellar(inputCoin) && tokenOnlyOnStellar(outputCoin)) {
    return true;
  }

  if (!isTokenOnChain(inputCoin, "stellar") || !isTokenOnChain(outputCoin, "stellar")) {
    return false;
  }

  const inputOnSelected = isTokenOnChain(inputCoin, selectedChain, selectedEvm);
  const outputOnSelected = isTokenOnChain(outputCoin, selectedChain, selectedEvm);
  return !inputOnSelected || !outputOnSelected;
}

function snapshotQuoteParams(intent: StellarRoutingFallbackIntent): StellarRoutingFallbackQuoteParams {
  return {
    token_in: intent.token_in,
    token_out: intent.token_out,
    amount: intent.amount,
    trade_type: intent.trade_type,
    slippage: intent.slippage,
    from_address: intent.from_address,
  };
}

export function partialSwapIntentToStellarRoutingIntent(
  intent: PartialSwapIntent,
  amount: string,
  extras?: Pick<StellarRoutingFallbackIntent, "trade_type" | "slippage" | "from_address">,
): StellarRoutingFallbackIntent | null {
  const inputCoin = intent.inputCoin?.trim();
  const outputCoin = intent.outputCoin?.trim();
  const chainId = intent.chainId;
  if (!inputCoin || !outputCoin || !chainId || chainId === "stellar") {
    return null;
  }

  const side = intent.amountSide ?? "pay";
  const tradeType =
    extras?.trade_type ?? (side === "receive" ? "EXACT_OUT" : "EXACT_IN");

  return {
    token_in: inputCoin,
    token_out: outputCoin,
    amount,
    chain_id: chainId,
    ...(intent.evmChainId !== undefined ? { evm_chain_id: intent.evmChainId } : {}),
    trade_type: tradeType,
    ...(extras?.slippage !== undefined ? { slippage: extras.slippage } : {}),
    ...(extras?.from_address ? { from_address: extras.from_address } : {}),
  };
}

export async function buildStellarRoutingFallbackOffer(
  privyUserId: string,
  intent: StellarRoutingFallbackIntent,
  error?: AppError,
): Promise<StellarRoutingFallbackOffer> {
  if (!isSoroswapEnabled()) {
    throw new AppError(503, "SOROSWAP_UNAVAILABLE", "Stellar routing fallback is not available.");
  }

  const now = Date.now();
  const fallbackOfferId = randomUUID();
  const offeredAt = new Date(now).toISOString();
  const expiresAt = new Date(now + OFFER_TTL_MS).toISOString();

  const offer: StoredStellarRoutingFallbackOffer = {
    fallback_offer_id: fallbackOfferId,
    status: "offered",
    selected_chain_id: intent.chain_id,
    selected_evm_chain_id: intent.evm_chain_id,
    token_in: intent.token_in,
    token_out: intent.token_out,
    amount: intent.amount,
    trade_type: intent.trade_type,
    slippage: intent.slippage,
    offered_at: offeredAt,
    expires_at: expiresAt,
    primary_error_code: error?.code,
    privyUserId,
    quoteParams: snapshotQuoteParams(intent),
  };

  await storeStellarRoutingFallbackOffer(offer);

  const { privyUserId: _owner, quoteParams: _params, ...publicOffer } = offer;
  return publicOffer;
}

function fallbackOfferInvalidError(status: string): AppError {
  return new AppError(
    400,
    "FALLBACK_OFFER_INVALID",
    `Stellar routing fallback offer is no longer available (${status}).`,
  );
}

export async function acceptStellarRoutingFallback(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<StellarRoutingFallbackQuoteResult> {
  const stored = await getStellarRoutingFallbackOffer(fallbackOfferId);
  if (!stored) {
    throw new AppError(
      404,
      "FALLBACK_OFFER_NOT_FOUND",
      "Stellar routing fallback offer expired or was not found.",
    );
  }
  if (stored.privyUserId !== privyUserId) {
    throw new AppError(403, "FALLBACK_OFFER_FORBIDDEN", "This fallback offer belongs to another user.");
  }
  if (stored.status !== "offered") {
    throw fallbackOfferInvalidError(stored.status);
  }

  const transition = await transitionStellarRoutingFallbackOfferStatus(fallbackOfferId, "accepted");
  if (!transition.ok) {
    if (transition.reason === "not_found" || transition.reason === "expired") {
      throw new AppError(
        404,
        "FALLBACK_OFFER_NOT_FOUND",
        "Stellar routing fallback offer expired or was not found.",
      );
    }
    throw fallbackOfferInvalidError(transition.currentStatus ?? "unknown");
  }

  const quoteResult = await callGetSoroswapQuoteForFallback(
    privyUserId,
    transition.offer.quoteParams,
  );

  logStellarRoutingFallbackAcceptedTotal({
    fallback_offer_id: fallbackOfferId,
    selected_chain_id: transition.offer.selected_chain_id,
    selected_evm_chain_id: transition.offer.selected_evm_chain_id,
    token_in: transition.offer.token_in,
    token_out: transition.offer.token_out,
    primary_error_code: transition.offer.primary_error_code,
  });

  return {
    ...quoteResult,
    routing: { primary: "stellar-soroswap" },
  };
}

export async function rejectStellarRoutingFallback(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<{ status: "rejected" }> {
  const stored = await getStellarRoutingFallbackOffer(fallbackOfferId);
  if (!stored) {
    throw new AppError(
      404,
      "FALLBACK_OFFER_NOT_FOUND",
      "Stellar routing fallback offer expired or was not found.",
    );
  }
  if (stored.privyUserId !== privyUserId) {
    throw new AppError(403, "FALLBACK_OFFER_FORBIDDEN", "This fallback offer belongs to another user.");
  }
  if (stored.status !== "offered") {
    throw fallbackOfferInvalidError(stored.status);
  }

  const transition = await transitionStellarRoutingFallbackOfferStatus(fallbackOfferId, "rejected");
  if (!transition.ok) {
    if (transition.reason === "not_found" || transition.reason === "expired") {
      throw new AppError(
        404,
        "FALLBACK_OFFER_NOT_FOUND",
        "Stellar routing fallback offer expired or was not found.",
      );
    }
    throw fallbackOfferInvalidError(transition.currentStatus ?? "unknown");
  }

  return { status: "rejected" };
}
