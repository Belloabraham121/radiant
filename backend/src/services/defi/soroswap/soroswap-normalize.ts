import { createHash } from "node:crypto";
import { resolveTokenSymbol } from "../../../config/supported-tokens.js";
import { atomicToDisplay } from "../deepbook/asset-scalars.js";
import type { StellarSwapQuote } from "../types.js";
import type { SoroswapQuoteResponse } from "./soroswap.types.js";

/** Quote store TTL — align approval countdown (~60s). */
export const SOROSWAP_QUOTE_TTL_MS = 60_000;

export function createSoroswapQuoteId(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `soroswap:${hash}`;
}

export function readSoroswapQuoteExpiresAt(quote: SoroswapQuoteResponse): string | null {
  const raw = quote.expiresAt ?? quote.expires_at;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function normalizeTokenSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function stellarTokenDecimals(symbol: string): number {
  const resolved = resolveTokenSymbol("stellar", symbol);
  if (resolved.match !== "exact") {
    return 7;
  }
  return resolved.token.decimals;
}

function parseAtomicAmount(raw: string | undefined): bigint {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return 0n;
  }
  return BigInt(raw);
}

/** Normalize Soroswap quote response to Radiant `StellarSwapQuote` for agent/approval layers. */
export function normalizeSoroswapQuote(input: {
  token_in: string;
  token_out: string;
  quote_id: string;
  quote: SoroswapQuoteResponse;
}): StellarSwapQuote {
  const tokenIn = normalizeTokenSymbol(input.token_in);
  const tokenOut = normalizeTokenSymbol(input.token_out);
  const inDecimals = stellarTokenDecimals(tokenIn);
  const outDecimals = stellarTokenDecimals(tokenOut);

  const inputAtomic = input.quote.amountIn ?? "0";
  const outputAtomic = input.quote.amountOut ?? "0";
  const inputDisplay = atomicToDisplay(parseAtomicAmount(inputAtomic), inDecimals);
  const outputDisplay = atomicToDisplay(parseAtomicAmount(outputAtomic), outDecimals);
  const price = inputDisplay > 0 ? outputDisplay / inputDisplay : null;

  return {
    provider_id: "stellar-soroswap",
    pool_key: `${tokenIn}_${tokenOut}`,
    input_coin: tokenIn,
    output_coin: tokenOut,
    input_amount_atomic: inputAtomic,
    output_amount_atomic: outputAtomic,
    input_amount_display: inputDisplay,
    output_amount_display: outputDisplay,
    price,
    fee_deep: null,
    expires_at: readSoroswapQuoteExpiresAt(input.quote),
    quote_id: input.quote_id,
    route_id: input.quote_id,
    provider_payload: {
      kind: "soroswap",
      quote_id: input.quote_id,
      quote: input.quote,
    },
  };
}
