import { z } from "zod";
import { optional } from "./optional-env.js";

export type SoroswapNetwork = "mainnet" | "testnet";

export type SoroswapTradeType = "EXACT_IN" | "EXACT_OUT";

export type SoroswapConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  network: SoroswapNetwork;
  /** Fraction (e.g. 0.01 = 1%) — converted to Soroswap slippage units in services. */
  defaultSlippage: number;
  defaultTradeType: SoroswapTradeType;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
};

const soroswapNetworkSchema = z.enum(["mainnet", "testnet"]);
const soroswapTradeTypeSchema = z.enum(["EXACT_IN", "EXACT_OUT"]);

export function getSoroswapConfig(): SoroswapConfig {
  const networkRaw = process.env.SOROSWAP_NETWORK?.trim().toLowerCase();
  const network = soroswapNetworkSchema.safeParse(networkRaw).success
    ? (networkRaw as SoroswapNetwork)
    : "mainnet";

  const tradeTypeRaw = process.env.SOROSWAP_DEFAULT_TRADE_TYPE?.trim().toUpperCase();
  const defaultTradeType = soroswapTradeTypeSchema.safeParse(tradeTypeRaw).success
    ? (tradeTypeRaw as SoroswapTradeType)
    : "EXACT_IN";

  const baseUrl =
    process.env.SOROSWAP_API_BASE_URL?.trim() || "https://api.soroswap.finance";

  return {
    enabled: process.env.SOROSWAP_ENABLED?.trim() === "true",
    apiBaseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.SOROSWAP_API_KEY?.trim() ?? "",
    network,
    defaultSlippage: Number.parseFloat(optional("SOROSWAP_DEFAULT_SLIPPAGE", "0.01")),
    defaultTradeType,
    rateLimitCapacity: Number.parseInt(optional("SOROSWAP_RATE_LIMIT_CAPACITY", "30"), 10),
    rateLimitRefillIntervalMs: Number.parseInt(optional("SOROSWAP_RATE_LIMIT_REFILL_MS", "2000"), 10),
  };
}

/** Soroswap is opt-in via env — requires API key and SOROSWAP_ENABLED=true. */
export function isSoroswapEnabled(): boolean {
  if (process.env.SOROSWAP_ENABLED?.trim() !== "true") {
    return false;
  }
  const { apiKey } = getSoroswapConfig();
  if (!apiKey) {
    return false;
  }
  return true;
}
