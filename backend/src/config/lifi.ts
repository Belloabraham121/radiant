import { getEnabledChainConfigs } from "./chains.js";
import { optional } from "./optional-env.js";

export type LifiConfig = {
  apiBaseUrl: string;
  apiKey: string;
  integrator: string;
  defaultSlippage: number;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
  executeRateLimitCapacity: number;
  executeRateLimitRefillMs: number;
  statusPollRefillMs: number;
};

export function getLifiConfig(): LifiConfig {
  const baseUrl = process.env.LIFI_API_BASE_URL?.trim() || "https://li.quest/v1";

  return {
    apiBaseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.LIFI_API_KEY?.trim() ?? "",
    integrator: optional("LIFI_INTEGRATOR", "radiant"),
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

/** Li-Fi works without an API key (lower limits). Disabled only via env or missing EVM chain. */
export function isLifiEnabled(): boolean {
  if (process.env.LIFI_ENABLED?.trim() === "false") {
    return false;
  }
  return getEnabledChainConfigs().some((config) => config.id === "ethereum");
}
