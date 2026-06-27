import { AppError } from "../../../errors/app-error.js";
import { getStoredSoroswapQuote } from "./soroswap-cache.js";
import type { SoroswapStoredQuotePayload } from "./soroswap.types.js";

/** Resolve stored quote for execute — Phase 2.7 adds re-quote when expired. */
export async function resolveSoroswapQuoteForExecute(input: {
  quoteId: string;
  routeId?: string;
}): Promise<SoroswapStoredQuotePayload> {
  const quoteId = input.routeId?.startsWith("soroswap:")
    ? input.routeId
    : input.quoteId.startsWith("soroswap:")
      ? input.quoteId
      : input.quoteId;

  const stored = await getStoredSoroswapQuote(quoteId);
  if (!stored) {
    throw new AppError(400, "SOROSWAP_QUOTE_EXPIRED", "This quote expired. Getting a fresh quote…", {
      quote_id: quoteId,
    });
  }

  if (stored.expires_at && Date.parse(stored.expires_at) <= Date.now()) {
    throw new AppError(400, "SOROSWAP_QUOTE_EXPIRED", "This quote expired. Getting a fresh quote…", {
      quote_id: quoteId,
      expires_at: stored.expires_at,
    });
  }

  // TODO(Phase 2.7): re-quote via getSoroswapQuote(..., { skipCache: true }) when expired at approval.
  // TODO(Phase 2.7): invalidateDefiBalanceCache("stellar", address) after confirmed swap in execute service.

  return stored;
}
