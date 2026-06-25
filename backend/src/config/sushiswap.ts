import { optional } from "./optional-env.js";

export type SushiswapConfig = {
  apiBaseUrl: string;
  apiKey: string;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
  fallbackToLifi: boolean;
};

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getSushiswapConfig(): SushiswapConfig {
  const baseUrl = process.env.SUSHI_API_BASE_URL?.trim() || "https://api.sushi.com";

  return {
    apiBaseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.SUSHI_API_KEY?.trim() ?? "",
    rateLimitCapacity: Number.parseInt(optional("SUSHI_RATE_LIMIT_CAPACITY", "30"), 10),
    rateLimitRefillIntervalMs: Number.parseInt(optional("SUSHI_RATE_LIMIT_REFILL_MS", "2000"), 10),
    fallbackToLifi: parseBooleanEnv("SUSHI_FALLBACK_TO_LIFI", false),
  };
}

export function isSushiswapEnabled(): boolean {
  return Boolean(process.env.SUSHI_API_KEY?.trim());
}

/** When true, same-chain EVM routing may fall back to Li-Fi if configured. */
export function isSushiFallbackToLifiEnabled(): boolean {
  return getSushiswapConfig().fallbackToLifi;
}
