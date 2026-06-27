import { AppError } from "../../../errors/app-error.js";
import { getStoredSoroswapQuote } from "./soroswap-cache.js";
import type { SoroswapQuoteInput, SoroswapStoredQuotePayload } from "./soroswap.types.js";

function resolveQuoteId(input: { quoteId: string; routeId?: string }): string {
  if (input.routeId?.startsWith("soroswap:")) {
    return input.routeId;
  }
  if (input.quoteId.startsWith("soroswap:")) {
    return input.quoteId;
  }
  return input.quoteId;
}

function isQuoteExpired(stored: SoroswapStoredQuotePayload): boolean {
  return Boolean(stored.expires_at && Date.parse(stored.expires_at) <= Date.now());
}

function readSnapshotString(params: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Map execute/approval snapshot fields to a Soroswap quote input for re-quote. */
export function snapshotParamsToSoroswapQuoteInput(
  params: Record<string, unknown>,
): SoroswapQuoteInput | null {
  const tokenIn = readSnapshotString(params, "token_in", "input_coin", "from_token");
  const tokenOut = readSnapshotString(params, "token_out", "output_coin", "to_token");
  const amount = readSnapshotString(params, "amount", "input_amount_atomic", "amount_atomic");
  if (!tokenIn || !tokenOut || !amount) {
    return null;
  }

  const input: SoroswapQuoteInput = {
    token_in: tokenIn,
    token_out: tokenOut,
    amount,
  };

  const tradeType = params.trade_type;
  if (tradeType === "EXACT_IN" || tradeType === "EXACT_OUT") {
    input.trade_type = tradeType;
  }

  if (typeof params.slippage === "number") {
    input.slippage = params.slippage;
  }

  const fromAddress = readSnapshotString(params, "from_address");
  if (fromAddress) {
    input.from_address = fromAddress;
  }

  return input;
}

async function requoteFromSnapshot(
  privyUserId: string,
  snapshotParams: Record<string, unknown>,
): Promise<SoroswapStoredQuotePayload | null> {
  const quoteInput = snapshotParamsToSoroswapQuoteInput(snapshotParams);
  if (!quoteInput) {
    return null;
  }

  const { getSoroswapQuote } = await import("./soroswap-quote.service.js");
  const refreshed = await getSoroswapQuote(privyUserId, quoteInput, { skipCache: true });
  const stored = await getStoredSoroswapQuote(refreshed.quote_id);
  if (stored) {
    return stored;
  }

  return {
    quote: refreshed.quote,
    quote_id: refreshed.quote_id,
    stored_at: new Date().toISOString(),
    expires_at: refreshed.expires_at,
    raw_request: {
      assetIn: refreshed.quote.assetIn ?? "",
      assetOut: refreshed.quote.assetOut ?? "",
      amount: quoteInput.amount,
      tradeType: quoteInput.trade_type ?? "EXACT_IN",
    },
  };
}

/** Resolve stored quote for execute — re-quote when expired if snapshot params are available. */
export async function resolveSoroswapQuoteForExecute(input: {
  quoteId: string;
  routeId?: string;
  snapshotParams?: Record<string, unknown>;
  privyUserId?: string;
}): Promise<SoroswapStoredQuotePayload> {
  const quoteId = resolveQuoteId(input);

  const stored = await getStoredSoroswapQuote(quoteId);
  if (stored && !isQuoteExpired(stored)) {
    return stored;
  }

  if (input.privyUserId && input.snapshotParams) {
    try {
      const refreshed = await requoteFromSnapshot(input.privyUserId, input.snapshotParams);
      if (refreshed && !isQuoteExpired(refreshed)) {
        return refreshed;
      }
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        502,
        "SOROSWAP_REQUOTE_FAILED",
        "Couldn't refresh the quote right now. Please try again.",
      );
    }
  }

  throw new AppError(400, "SOROSWAP_QUOTE_EXPIRED", "This quote expired. Getting a fresh quote…", {
    quote_id: quoteId,
    ...(stored?.expires_at ? { expires_at: stored.expires_at } : {}),
  });
}
