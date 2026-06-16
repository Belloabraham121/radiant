import { optional } from "./optional-env.js";

export type CoingeckoConfig = {
  apiKey: string;
  baseUrl: string;
  /** Demo vs pro header name */
  apiKeyHeader: string;
  priceTtlSeconds: number;
  logoTtlSeconds: number;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
  walletAssetsRateLimitCapacity: number;
  walletAssetsRateLimitRefillIntervalMs: number;
};

function resolveBaseUrl(apiKey: string): string {
  const explicit = process.env.COINGECKO_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // Demo keys (CG-…) use the public API host; Pro keys use pro-api.
  if (apiKey.startsWith("CG-")) {
    return "https://api.coingecko.com/api/v3";
  }
  return "https://pro-api.coingecko.com/api/v3";
}

function resolveApiKeyHeader(apiKey: string): string {
  if (process.env.COINGECKO_API_KEY_HEADER?.trim()) {
    return process.env.COINGECKO_API_KEY_HEADER.trim();
  }
  return apiKey.startsWith("CG-") ? "x-cg-demo-api-key" : "x-cg-pro-api-key";
}

export function getCoingeckoConfig(): CoingeckoConfig {
  const apiKey = process.env.COINGECKO_API_KEY?.trim() ?? "";

  return {
    apiKey,
    baseUrl: resolveBaseUrl(apiKey),
    apiKeyHeader: resolveApiKeyHeader(apiKey),
    priceTtlSeconds: Number.parseInt(
      optional("COINGECKO_PRICE_TTL_SECONDS", "90"),
      10,
    ),
    logoTtlSeconds: Number.parseInt(
      optional("COINGECKO_LOGO_TTL_SECONDS", String(60 * 60 * 24 * 30)),
      10,
    ),
    rateLimitCapacity: Number.parseInt(
      optional("COINGECKO_RATE_LIMIT_CAPACITY", "10"),
      10,
    ),
    rateLimitRefillIntervalMs: Number.parseInt(
      optional("COINGECKO_RATE_LIMIT_REFILL_MS", "6000"),
      10,
    ),
    walletAssetsRateLimitCapacity: Number.parseInt(
      optional("WALLET_ASSETS_RATE_LIMIT_CAPACITY", "12"),
      10,
    ),
    walletAssetsRateLimitRefillIntervalMs: Number.parseInt(
      optional("WALLET_ASSETS_RATE_LIMIT_REFILL_MS", "5000"),
      10,
    ),
  };
}

export function isCoingeckoEnabled(): boolean {
  return Boolean(process.env.COINGECKO_API_KEY?.trim());
}
