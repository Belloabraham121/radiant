import { getEnabledSquidChainIds } from "./squid-chains.js";
import { optional } from "./optional-env.js";

export const SQUID_API_BASE_URL_DEFAULT = "https://v2.api.squidrouter.com";

export type SquidConfig = {
  apiBaseUrl: string;
  integratorId: string;
  /** Fraction (e.g. 0.01 = 1%) — converted to Squid slippage units in services. */
  defaultSlippage: number;
  /**
   * Outbound token bucket capacity per window.
   * Squid docs: integrator requests count toward per-integrator RPS limits but do not
   * publish exact thresholds — https://docs.squidrouter.com/api-and-sdk-integration/key-concepts/get-a-route
   */
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
};

/** Squid slippage API uses percent units (1 = 1%). Radiant env uses Li-Fi-style fractions. */
export function squidSlippageFromFraction(fraction: number): number {
  return fraction * 100;
}

export function getSquidConfig(): SquidConfig {
  const baseUrl = process.env.SQUID_API_BASE_URL?.trim() || SQUID_API_BASE_URL_DEFAULT;

  return {
    apiBaseUrl: baseUrl.replace(/\/$/, ""),
    integratorId: process.env.SQUID_INTEGRATOR_ID?.trim() ?? "",
    defaultSlippage: Number.parseFloat(optional("SQUID_DEFAULT_SLIPPAGE", "0.01")),
    rateLimitCapacity: Number.parseInt(optional("SQUID_RATE_LIMIT_CAPACITY", "10"), 10),
    rateLimitRefillIntervalMs: Number.parseInt(optional("SQUID_RATE_LIMIT_REFILL_MS", "2000"), 10),
  };
}

/** Squid fallback is opt-in via env — requires integrator id and at least one enabled corridor. */
export function isSquidEnabled(): boolean {
  if (process.env.SQUID_ENABLED?.trim() !== "true") {
    return false;
  }
  const { integratorId } = getSquidConfig();
  if (!integratorId) {
    return false;
  }
  return getEnabledSquidChainIds().length > 0;
}
