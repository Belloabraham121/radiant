import { randomUUID } from "node:crypto";
import { isSquidEnabled } from "../../../config/squid.js";
import { AppError } from "../../../errors/app-error.js";
import type { LifiRoutesInput } from "../lifi/lifi.types.js";
import { getSquidRoutes } from "../squid/squid-routes.service.js";
import type { SquidRoutesInput } from "../squid/squid.types.js";
import {
  FALLBACK_OFFER_TTL_SECONDS,
  getLiquidityFallbackOffer,
  markFallbackOfferAccepted,
  markFallbackOfferRejected,
  storeLiquidityFallbackOffer,
} from "./cross-chain-fallback-cache.js";
import type {
  CrossChainFallbackQuoteParams,
  CrossChainRoutesResult,
  LiquidityFallbackOffer,
  StoredLiquidityFallbackOffer,
} from "./cross-chain.types.js";
import type { ChainId } from "../../chains/types.js";

const OFFER_TTL_MS = FALLBACK_OFFER_TTL_SECONDS * 1000;

type GetSquidRoutesFn = typeof getSquidRoutes;

let getSquidRoutesOverride: GetSquidRoutesFn | null = null;

export function setGetSquidRoutesForTests(fn: GetSquidRoutesFn | null): void {
  getSquidRoutesOverride = fn;
}

function callGetSquidRoutes(privyUserId: string, input: SquidRoutesInput): Promise<CrossChainRoutesResult> {
  if (getSquidRoutesOverride) {
    return getSquidRoutesOverride(privyUserId, input);
  }
  return getSquidRoutes(privyUserId, input);
}

function resolveOfferChainId(input: LifiRoutesInput, prefix: "from" | "to"): ChainId {
  const chainId = input[`${prefix}_chain_id`];
  if (chainId) {
    return chainId;
  }
  if (input[`${prefix}_evm_chain_id`] !== undefined) {
    return "ethereum";
  }
  throw new AppError(400, "VALIDATION_ERROR", `${prefix} chain is required for liquidity fallback.`);
}

function snapshotQuoteParams(input: LifiRoutesInput): CrossChainFallbackQuoteParams {
  return {
    from_chain_id: input.from_chain_id,
    to_chain_id: input.to_chain_id,
    from_evm_chain_id: input.from_evm_chain_id,
    to_evm_chain_id: input.to_evm_chain_id,
    from_token: input.from_token,
    to_token: input.to_token,
    amount_atomic: input.amount_atomic,
    slippage: input.slippage,
    confirm_same_token: input.confirm_same_token,
    max_routes: input.max_routes,
  };
}

export async function buildLiquidityFallbackOffer(
  privyUserId: string,
  input: LifiRoutesInput,
  lifiError?: AppError,
): Promise<LiquidityFallbackOffer> {
  if (!isSquidEnabled()) {
    throw new AppError(503, "SQUID_UNAVAILABLE", "Squid liquidity fallback is not available.");
  }

  const now = Date.now();
  const fallbackOfferId = randomUUID();
  const offeredAt = new Date(now).toISOString();
  const expiresAt = new Date(now + OFFER_TTL_MS).toISOString();

  const offer: StoredLiquidityFallbackOffer = {
    fallback_offer_id: fallbackOfferId,
    status: "offered",
    from_chain_id: resolveOfferChainId(input, "from"),
    to_chain_id: resolveOfferChainId(input, "to"),
    from_evm_chain_id: input.from_evm_chain_id,
    to_evm_chain_id: input.to_evm_chain_id,
    from_token: input.from_token ?? "",
    to_token: input.to_token ?? "",
    amount_atomic: input.amount_atomic ?? "",
    slippage: input.slippage,
    confirm_same_token: input.confirm_same_token,
    offered_at: offeredAt,
    expires_at: expiresAt,
    primary_error_code: lifiError?.code,
    privyUserId,
    quoteParams: snapshotQuoteParams(input),
  };

  await storeLiquidityFallbackOffer(offer);

  const { privyUserId: _owner, quoteParams: _params, ...publicOffer } = offer;
  return publicOffer;
}

export async function acceptLiquidityFallback(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<CrossChainRoutesResult> {
  const stored = await getLiquidityFallbackOffer(fallbackOfferId);
  if (!stored) {
    throw new AppError(
      404,
      "FALLBACK_OFFER_NOT_FOUND",
      "Liquidity fallback offer expired or was not found.",
    );
  }
  if (stored.privyUserId !== privyUserId) {
    throw new AppError(403, "FALLBACK_OFFER_FORBIDDEN", "This fallback offer belongs to another user.");
  }
  if (stored.status !== "offered") {
    throw new AppError(
      400,
      "FALLBACK_OFFER_INVALID",
      `Liquidity fallback offer is no longer available (${stored.status}).`,
    );
  }

  const squidResult = await callGetSquidRoutes(privyUserId, stored.quoteParams);
  await markFallbackOfferAccepted(fallbackOfferId);

  return {
    ...squidResult,
    routing: { primary: "evm-squid" },
  };
}

export async function rejectLiquidityFallback(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<{ status: "rejected" }> {
  const stored = await getLiquidityFallbackOffer(fallbackOfferId);
  if (!stored) {
    throw new AppError(
      404,
      "FALLBACK_OFFER_NOT_FOUND",
      "Liquidity fallback offer expired or was not found.",
    );
  }
  if (stored.privyUserId !== privyUserId) {
    throw new AppError(403, "FALLBACK_OFFER_FORBIDDEN", "This fallback offer belongs to another user.");
  }
  if (stored.status !== "offered") {
    throw new AppError(
      400,
      "FALLBACK_OFFER_INVALID",
      `Liquidity fallback offer is no longer available (${stored.status}).`,
    );
  }

  await markFallbackOfferRejected(fallbackOfferId);
  return { status: "rejected" };
}
