import { getSoroswapConfig, isSoroswapEnabled } from "../../../config/soroswap.js";
import { assertSoroswapTokenPair } from "../../../config/soroswap-chains.js";
import { resolveTokenSymbol } from "../../../config/supported-tokens.js";
import { AppError } from "../../../errors/app-error.js";
import { soroswapRestFetch } from "./soroswap.client.js";
import {
  getStoredSoroswapQuote,
  soroswapCachedQuoteFetch,
  storeSoroswapQuote,
} from "./soroswap-cache.js";
import { defaultSoroswapProtocols, getSoroswapHealth } from "./soroswap-health.service.js";
import {
  createSoroswapQuoteId,
  readSoroswapQuoteExpiresAt,
} from "./soroswap-normalize.js";
import { consumeSoroswapQuoteQuota } from "./soroswap-rate-limit.js";
import { getSoroswapTokens } from "./soroswap-token-catalog.service.js";
import {
  soroswapQuoteResponseSchema,
  type SoroswapQuoteInput,
  type SoroswapQuoteRequest,
  type SoroswapQuoteResponse,
  type SoroswapStoredQuotePayload,
} from "./soroswap.types.js";

export type SoroswapQuoteResult = {
  quote_id: string;
  quote: SoroswapQuoteResponse;
  expires_at: string | null;
};

function slippageBpsFromFraction(fraction: number): number {
  return Math.round(fraction * 10_000);
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

async function resolveSoroswapAssetAddress(symbol: string): Promise<string> {
  const normalized = normalizeSymbol(symbol);
  const tokens = await getSoroswapTokens();
  const fromCatalog = tokens.find((entry) => normalizeSymbol(entry.symbol) === normalized);
  if (fromCatalog?.address) {
    return fromCatalog.address;
  }

  const supported = resolveTokenSymbol("stellar", normalized);
  if (supported.match === "exact" && supported.token.address) {
    return supported.token.address;
  }

  throw new AppError(400, "VALIDATION_ERROR", `Unable to resolve Stellar asset for "${normalized}".`, {
    symbol: normalized,
    chain_id: "stellar",
  });
}

function buildQuoteCacheParams(input: {
  assetIn: string;
  assetOut: string;
  amount: string;
  tradeType: string;
  slippageBps: number;
  protocols: string[];
  from?: string;
}): Record<string, unknown> {
  const config = getSoroswapConfig();
  return {
    network: config.network,
    assetIn: input.assetIn,
    assetOut: input.assetOut,
    amount: input.amount,
    tradeType: input.tradeType,
    slippageBps: input.slippageBps,
    protocols: [...input.protocols].sort(),
    ...(input.from ? { from: input.from } : {}),
  };
}

/**
 * Soroswap quote skeleton — rate limit → dedupe cache → POST /quote → quote store.
 * Pass `{ skipCache: true }` at execute/approval refresh (Phase 2.7).
 */
export async function getSoroswapQuote(
  privyUserId: string,
  input: SoroswapQuoteInput,
  options?: { skipCache?: boolean },
): Promise<SoroswapQuoteResult> {
  if (!isSoroswapEnabled()) {
    throw new AppError(503, "SOROSWAP_UNAVAILABLE", "Stellar swap service is temporarily unavailable.");
  }

  assertSoroswapTokenPair(input.token_in, input.token_out);
  await consumeSoroswapQuoteQuota(privyUserId);

  const config = getSoroswapConfig();
  const [assetIn, assetOut, health] = await Promise.all([
    resolveSoroswapAssetAddress(input.token_in),
    resolveSoroswapAssetAddress(input.token_out),
    getSoroswapHealth(),
  ]);

  const tradeType = input.trade_type ?? config.defaultTradeType;
  const slippageBps = slippageBpsFromFraction(input.slippage ?? config.defaultSlippage);
  const protocols = defaultSoroswapProtocols(health);

  const requestBody: SoroswapQuoteRequest = {
    assetIn,
    assetOut,
    amount: input.amount,
    tradeType,
    slippageBps,
    protocols,
    ...(input.from_address ? { from: input.from_address } : {}),
  };

  const cacheParams = buildQuoteCacheParams({
    assetIn,
    assetOut,
    amount: input.amount,
    tradeType,
    slippageBps,
    protocols,
    from: input.from_address,
  });

  const skipCache = options?.skipCache ?? input.skip_cache ?? false;

  const quote = await soroswapCachedQuoteFetch(
    cacheParams,
    async () => {
      const raw = await soroswapRestFetch<unknown>("/quote", {
        method: "POST",
        body: requestBody,
      });
      return soroswapQuoteResponseSchema.parse(raw);
    },
    { skipCache },
  );

  const quoteSeed = JSON.stringify({
    ...cacheParams,
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
  });
  const quoteId = createSoroswapQuoteId(quoteSeed);
  const expiresAt = readSoroswapQuoteExpiresAt(quote);

  const stored: SoroswapStoredQuotePayload = {
    quote,
    quote_id: quoteId,
    stored_at: new Date().toISOString(),
    expires_at: expiresAt,
    raw_request: requestBody,
  };
  await storeSoroswapQuote(quoteId, stored);

  return {
    quote_id: quoteId,
    quote,
    expires_at: expiresAt,
  };
}

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
