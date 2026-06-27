import type { StellarSwapQuote } from "../../../defi/types.js";
import { normalizeSoroswapQuote } from "../../../defi/soroswap/soroswap-normalize.js";
import { getSoroswapQuote } from "../../../defi/soroswap/soroswap-quote.service.js";
import {
  resolveSoroswapQuoteForExecute,
  snapshotParamsToSoroswapQuoteInput,
} from "../../../defi/soroswap/soroswap-quote-store.service.js";
import type { SoroswapStoredQuotePayload } from "../../../defi/soroswap/soroswap.types.js";
import { fmtDisplayNumber } from "../../../../utils/format-display-number.js";
import { coalesceDeFiQuoteExpiresAt } from "../quote-expiry.js";

function readString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(params: Record<string, unknown>, key: string): number | null {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTokenSymbol(params: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = readString(params, key);
    if (value) {
      return value.toUpperCase();
    }
  }
  return null;
}

function resolveMinOutDisplay(
  outputDisplay: number,
  slippage: number | null,
): number | null {
  if (slippage === null || slippage <= 0 || slippage >= 1) {
    return null;
  }
  return outputDisplay * (1 - slippage);
}

function storedPayloadToSwapQuote(
  stored: SoroswapStoredQuotePayload,
  tokenIn: string,
  tokenOut: string,
): StellarSwapQuote {
  return normalizeSoroswapQuote({
    token_in: tokenIn,
    token_out: tokenOut,
    quote_id: stored.quote_id,
    quote: stored.quote,
  });
}

/** True when execute params carry enough metadata for the Soroswap approval UI. */
export function isSoroswapApprovalDisplayComplete(params: Record<string, unknown>): boolean {
  const tokenIn = readTokenSymbol(params, ["token_in", "input_coin", "from_token"]);
  const tokenOut = readTokenSymbol(params, ["token_out", "output_coin", "to_token"]);
  const payAmount =
    readString(params, "from_amount_display") ?? readString(params, "input_amount_display");
  const receiveAmount =
    readString(params, "to_amount_display") ??
    readString(params, "output_amount_display") ??
    (typeof params.estimated_out_display === "number"
      ? fmtDisplayNumber(params.estimated_out_display)
      : null);
  return Boolean(tokenIn && tokenOut && payAmount && receiveAmount);
}

/** Map a Soroswap quote snapshot onto execute params for approval UI. */
export function applySoroswapQuoteToExecuteParams(
  params: Record<string, unknown>,
  quote: StellarSwapQuote,
): Record<string, unknown> {
  const slippage = readNumber(params, "slippage");
  const minOutDisplay = resolveMinOutDisplay(quote.output_amount_display, slippage);
  const expiresAt = coalesceDeFiQuoteExpiresAt(quote.expires_at);

  return {
    ...params,
    provider_id: "stellar-soroswap",
    quote_id: quote.quote_id,
    route_id: quote.route_id ?? quote.quote_id,
    token_in: quote.input_coin,
    token_out: quote.output_coin,
    input_coin: quote.input_coin,
    output_coin: quote.output_coin,
    amount: quote.input_amount_atomic,
    input_amount_atomic: quote.input_amount_atomic,
    output_amount_atomic: quote.output_amount_atomic,
    from_amount_display: fmtDisplayNumber(quote.input_amount_display),
    to_amount_display: fmtDisplayNumber(quote.output_amount_display),
    input_amount_display: fmtDisplayNumber(quote.input_amount_display),
    output_amount_display: fmtDisplayNumber(quote.output_amount_display),
    estimated_out_display: quote.output_amount_display,
    ...(minOutDisplay !== null ? { min_out_display: minOutDisplay } : {}),
    expires_at: expiresAt,
    quote_expires_at: expiresAt,
    slippage,
    soroswap_quote: quote.provider_payload?.quote,
  };
}

function enrichFromQuoteSnapshot(params: Record<string, unknown>): Record<string, unknown> | null {
  const tokenIn = readTokenSymbol(params, ["token_in", "input_coin", "from_token"]);
  const tokenOut = readTokenSymbol(params, ["token_out", "output_coin", "to_token"]);
  const amountAtomic =
    readString(params, "amount") ??
    readString(params, "input_amount_atomic") ??
    readString(params, "amount_atomic");
  if (!tokenIn || !tokenOut) {
    return null;
  }

  const payDisplay =
    readString(params, "from_amount_display") ??
    readString(params, "input_amount_display");
  const receiveDisplay =
    readString(params, "to_amount_display") ??
    readString(params, "output_amount_display") ??
    (typeof params.estimated_out_display === "number"
      ? fmtDisplayNumber(params.estimated_out_display)
      : null);

  if (!payDisplay || !receiveDisplay) {
    return {
      ...params,
      token_in: tokenIn,
      token_out: tokenOut,
      input_coin: tokenIn,
      output_coin: tokenOut,
      ...(amountAtomic ? { amount: amountAtomic, input_amount_atomic: amountAtomic } : {}),
    };
  }

  const expiresAt = coalesceDeFiQuoteExpiresAt(
    readString(params, "expires_at") ?? readString(params, "quote_expires_at"),
  );

  return {
    ...params,
    provider_id: "stellar-soroswap",
    token_in: tokenIn,
    token_out: tokenOut,
    input_coin: tokenIn,
    output_coin: tokenOut,
    from_amount_display: payDisplay,
    to_amount_display: receiveDisplay,
    input_amount_display: payDisplay,
    output_amount_display: receiveDisplay,
    ...(amountAtomic ? { amount: amountAtomic, input_amount_atomic: amountAtomic } : {}),
    expires_at: expiresAt,
    quote_expires_at: expiresAt,
    slippage: readNumber(params, "slippage"),
  };
}

async function requoteFromSnapshot(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<StellarSwapQuote | null> {
  const quoteInput = snapshotParamsToSoroswapQuoteInput(params);
  if (!quoteInput) {
    return null;
  }

  const refreshed = await getSoroswapQuote(privyUserId, quoteInput, { skipCache: true });
  return normalizeSoroswapQuote({
    token_in: quoteInput.token_in,
    token_out: quoteInput.token_out,
    quote_id: refreshed.quote_id,
    quote: refreshed.quote,
  });
}

/** Resolve Soroswap quote + display fields for approval UI. */
export async function resolveSoroswapApprovalParams(
  params: Record<string, unknown>,
  options?: { privyUserId?: string; requoteOnCacheMiss?: boolean; forceRequote?: boolean },
): Promise<Record<string, unknown>> {
  const tokenIn =
    readTokenSymbol(params, ["token_in", "input_coin", "from_token"]) ?? "XLM";
  const tokenOut =
    readTokenSymbol(params, ["token_out", "output_coin", "to_token"]) ?? "USDC";

  if (options?.forceRequote && options.privyUserId) {
    const requoted = await requoteFromSnapshot(options.privyUserId, params);
    if (requoted) {
      return applySoroswapQuoteToExecuteParams(
        { ...params, quote_id: requoted.quote_id, route_id: requoted.route_id ?? requoted.quote_id },
        requoted,
      );
    }
  }

  const quoteId = readString(params, "quote_id") ?? readString(params, "route_id");
  if (quoteId) {
    try {
      const stored = await resolveSoroswapQuoteForExecute({
        quoteId,
        routeId: readString(params, "route_id") ?? undefined,
        ...(options?.privyUserId
          ? { privyUserId: options.privyUserId, snapshotParams: params }
          : {}),
      });
      const quote = storedPayloadToSwapQuote(stored, tokenIn, tokenOut);
      return applySoroswapQuoteToExecuteParams(params, quote);
    } catch {
      if (options?.requoteOnCacheMiss && options.privyUserId) {
        const requoted = await requoteFromSnapshot(options.privyUserId, params);
        if (requoted) {
          return applySoroswapQuoteToExecuteParams(
            {
              ...params,
              quote_id: requoted.quote_id,
              route_id: requoted.route_id ?? requoted.quote_id,
            },
            requoted,
          );
        }
      }
    }
  }

  const snapshot = enrichFromQuoteSnapshot(params);
  if (snapshot) {
    return snapshot;
  }

  return params;
}
