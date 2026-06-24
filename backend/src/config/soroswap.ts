import { z } from "zod";
import { optional } from "./optional-env.js";

export type SoroswapNetwork = "mainnet" | "testnet";

export type SoroswapConfig = {
  apiBaseUrl: string;
  apiKey: string;
  network: SoroswapNetwork;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
};

const soroswapNetworkSchema = z.enum(["mainnet", "testnet"]);

export function getSoroswapConfig(): SoroswapConfig {
  const networkRaw = process.env.SOROSWAP_NETWORK?.trim().toLowerCase();
  const network = soroswapNetworkSchema.safeParse(networkRaw).success
    ? (networkRaw as SoroswapNetwork)
    : "mainnet";

  const baseUrl =
    process.env.SOROSWAP_API_BASE_URL?.trim() || "https://api.soroswap.finance";

  return {
    apiBaseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.SOROSWAP_API_KEY?.trim() ?? "",
    network,
    rateLimitCapacity: Number.parseInt(optional("SOROSWAP_RATE_LIMIT_CAPACITY", "30"), 10),
    rateLimitRefillIntervalMs: Number.parseInt(optional("SOROSWAP_RATE_LIMIT_REFILL_MS", "2000"), 10),
  };
}

export function isSoroswapEnabled(): boolean {
  return Boolean(process.env.SOROSWAP_API_KEY?.trim());
}
