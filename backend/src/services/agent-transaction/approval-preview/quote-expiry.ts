import { LIFI_QUOTE_TTL_MS } from "../../defi/lifi/lifi-normalize.js";

/** Max remaining time we accept for a DeFi quote countdown (60s TTL + small slack). */
export const DEFI_QUOTE_MAX_REMAINING_MS = LIFI_QUOTE_TTL_MS + 30_000;

/**
 * Normalize quote expiry for approval UI — agents sometimes pass bridge ETA
 * (estimated_duration_seconds, e.g. ~349 min) as expires_at instead of the short quote TTL.
 */
export function coalesceDeFiQuoteExpiresAt(
  raw: string | null | undefined,
  nowMs = Date.now(),
): string {
  if (raw) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
      const remaining = parsed - nowMs;
      if (remaining > 0 && remaining <= DEFI_QUOTE_MAX_REMAINING_MS) {
        return new Date(parsed).toISOString();
      }
    }
  }
  return new Date(nowMs + LIFI_QUOTE_TTL_MS).toISOString();
}

/** Read quote expiry from execute params — supports DeepBook and Li-Fi field names. */
export function readDeFiQuoteExpiresAt(params: Record<string, unknown>): string | null {
  const quoteExpiresAt = params.quote_expires_at;
  if (typeof quoteExpiresAt === "string" && quoteExpiresAt.length > 0) {
    return quoteExpiresAt;
  }
  const expiresAt = params.expires_at;
  if (typeof expiresAt === "string" && expiresAt.length > 0) {
    return expiresAt;
  }
  return null;
}

export function isDeFiQuoteExpired(params: Record<string, unknown>, nowMs = Date.now()): boolean {
  const expiresAt = readDeFiQuoteExpiresAt(params);
  if (!expiresAt) {
    return false;
  }
  return nowMs >= new Date(expiresAt).getTime();
}

export function isDeFiQuoteFresh(params: Record<string, unknown>, nowMs = Date.now()): boolean {
  const expiresAt = readDeFiQuoteExpiresAt(params);
  if (!expiresAt || nowMs >= new Date(expiresAt).getTime()) {
    return false;
  }
  return (
    typeof params.estimated_out_display === "number" ||
    typeof params.to_amount_display === "string"
  );
}

/** @deprecated Prefer readDeFiQuoteExpiresAt */
export function readQuoteExpiresAt(params: Record<string, unknown>): string | null {
  return readDeFiQuoteExpiresAt(params);
}

/** @deprecated Prefer isDeFiQuoteExpired */
export function isSwapQuoteExpired(params: Record<string, unknown>, nowMs = Date.now()): boolean {
  return isDeFiQuoteExpired(params, nowMs);
}

/** @deprecated Prefer isDeFiQuoteFresh */
export function isSwapQuoteFresh(params: Record<string, unknown>, nowMs = Date.now()): boolean {
  return isDeFiQuoteFresh(params, nowMs);
}
