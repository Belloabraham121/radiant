import { getEnabledLifiChainIds } from "./lifi-chains.js";
import { optional } from "./optional-env.js";

/** Li-Fi integrator fee cap (5% per partner docs). */
export const LIFI_MAX_INTEGRATOR_FEE = 0.05;

export type LifiConfig = {
  apiBaseUrl: string;
  apiKey: string;
  integrator: string;
  /** Integrator fee fraction (e.g. 0.001 = 0.1%). Omitted from SDK calls when 0. */
  integratorFee: number;
  defaultSlippage: number;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
  executeRateLimitCapacity: number;
  executeRateLimitRefillMs: number;
  statusPollRefillMs: number;
};

export function parseLifiIntegratorFee(raw = optional("LIFI_INTEGRATOR_FEE", "0.001")): number {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0 || value > LIFI_MAX_INTEGRATOR_FEE) {
    throw new Error(
      `LIFI_INTEGRATOR_FEE must be a number from 0 to ${LIFI_MAX_INTEGRATOR_FEE}`,
    );
  }
  return value;
}

/** SDK quote/route params — omit fee when zero. */
export function lifiFeeSdkParam(fee: number): { fee?: number } {
  return fee > 0 ? { fee } : {};
}

export function lifiIntegratorSdkFields(
  config: Pick<LifiConfig, "integrator" | "integratorFee">,
  integratorOverride?: string,
): { integrator: string; fee?: number } {
  return {
    integrator: integratorOverride ?? config.integrator,
    ...lifiFeeSdkParam(config.integratorFee),
  };
}

export function getLifiConfig(): LifiConfig {
  const baseUrl = process.env.LIFI_API_BASE_URL?.trim() || "https://li.quest/v1";

  return {
    apiBaseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.LIFI_API_KEY?.trim() ?? "",
    integrator: optional("LIFI_INTEGRATOR", "radiant"),
    integratorFee: parseLifiIntegratorFee(),
    defaultSlippage: Number.parseFloat(optional("LIFI_DEFAULT_SLIPPAGE", "0.005")),
    rateLimitCapacity: Number.parseInt(optional("LIFI_RATE_LIMIT_CAPACITY", "30"), 10),
    rateLimitRefillIntervalMs: Number.parseInt(optional("LIFI_RATE_LIMIT_REFILL_MS", "2000"), 10),
    executeRateLimitCapacity: Number.parseInt(
      optional("LIFI_EXECUTE_RATE_LIMIT_CAPACITY", "5"),
      10,
    ),
    executeRateLimitRefillMs: Number.parseInt(
      optional("LIFI_EXECUTE_RATE_LIMIT_REFILL_MS", "3600000"),
      10,
    ),
    statusPollRefillMs: Number.parseInt(optional("LIFI_STATUS_POLL_REFILL_MS", "10000"), 10),
  };
}

/** Li-Fi works without an API key (lower limits). Disabled only via env or no enabled Li-Fi chains. */
export function isLifiEnabled(): boolean {
  if (process.env.LIFI_ENABLED?.trim() === "false") {
    return false;
  }
  return getEnabledLifiChainIds().length > 0;
}
