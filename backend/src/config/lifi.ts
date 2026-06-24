import { optional } from "./optional-env.js";

export type LifiConfig = {
  apiBaseUrl: string;
  apiKey: string;
  defaultSlippage: number;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
};

export function getLifiConfig(): LifiConfig {
  const baseUrl = process.env.LIFI_API_BASE_URL?.trim() || "https://li.quest/v1";

  return {
    apiBaseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.LIFI_API_KEY?.trim() ?? "",
    defaultSlippage: Number.parseFloat(optional("LIFI_DEFAULT_SLIPPAGE", "0.005")),
    rateLimitCapacity: Number.parseInt(optional("LIFI_RATE_LIMIT_CAPACITY", "30"), 10),
    rateLimitRefillIntervalMs: Number.parseInt(optional("LIFI_RATE_LIMIT_REFILL_MS", "2000"), 10),
  };
}

export function isLifiEnabled(): boolean {
  return Boolean(process.env.LIFI_API_KEY?.trim());
}
