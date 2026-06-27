import { getSoroswapConfig, isSoroswapEnabled } from "../../../config/soroswap.js";
import { assertSoroswapTokenPair } from "../../../config/soroswap-chains.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveSoroswapAsset } from "./soroswap-asset-resolve.js";
import { soroswapRestFetch } from "./soroswap.client.js";
import {
  soroswapCachedQuoteFetch,
  storeSoroswapQuote,
} from "./soroswap-cache.js";
import { defaultSoroswapProtocols, getSoroswapHealth } from "./soroswap-health.service.js";
import {
  createSoroswapQuoteId,
  readSoroswapQuoteExpiresAt,
} from "./soroswap-normalize.js";
import { resolveSoroswapQuoteForExecute } from "./soroswap-quote-store.service.js";
import { consumeSoroswapQuoteQuota } from "./soroswap-rate-limit.js";
import {
  soroswapQuoteResponseSchema,
  type SoroswapQuoteInput,
  type SoroswapQuoteRequest,
  type SoroswapQuoteResponse,
  type SoroswapStoredQuotePayload,
} from "./soroswap.types.js";
import { logStellarSwapQuoteTotal } from "./soroswap-observability.service.js";
import { resolveSoroswapWalletAddress } from "./soroswap-wallet-addresses.js";

export type SoroswapQuoteResult = {
  quote_id: string;
  quote: SoroswapQuoteResponse;
  expires_at: string | null;
};

function slippageBpsFromFraction(fraction: number): number {
  return Math.round(fraction * 10_000);
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
  options?: { skipCache?: boolean; source?: "direct" | "routing_fallback" },
): Promise<SoroswapQuoteResult> {
  const startedAt = Date.now();
  const quoteSource = options?.source ?? "direct";

  try {
  if (!isSoroswapEnabled()) {
    throw new AppError(503, "SOROSWAP_UNAVAILABLE", "Stellar swap service is temporarily unavailable.");
  }

  assertSoroswapTokenPair(input.token_in, input.token_out);
  await consumeSoroswapQuoteQuota(privyUserId);

  const config = getSoroswapConfig();
  const fromAddress = await resolveSoroswapWalletAddress(privyUserId, input.from_address);

  const [assetIn, assetOut, health] = await Promise.all([
    resolveSoroswapAsset(input.token_in),
    resolveSoroswapAsset(input.token_out),
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
    from: fromAddress,
  };

  const cacheParams = buildQuoteCacheParams({
    assetIn,
    assetOut,
    amount: input.amount,
    tradeType,
    slippageBps,
    protocols,
    from: fromAddress,
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
    request: cacheParams,
    quote,
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

  const result = {
    quote_id: quoteId,
    quote,
    expires_at: expiresAt,
  };

  logStellarSwapQuoteTotal({
    outcome: "success",
    quote_id: quoteId,
    token_in: input.token_in,
    token_out: input.token_out,
    duration_ms: Date.now() - startedAt,
    source: quoteSource,
  });

  return result;
  } catch (err) {
    logStellarSwapQuoteTotal({
      outcome: "error",
      token_in: input.token_in,
      token_out: input.token_out,
      error_code: err instanceof AppError ? err.code : "UNKNOWN",
      duration_ms: Date.now() - startedAt,
      source: quoteSource,
    });
    throw err;
  }
}

export { resolveSoroswapQuoteForExecute };
