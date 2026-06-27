import { createHash } from "node:crypto";
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
