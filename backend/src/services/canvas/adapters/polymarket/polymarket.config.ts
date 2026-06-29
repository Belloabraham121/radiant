import { optional } from "../../../../config/optional-env.js";

export type PolymarketConfig = {
  enabled: boolean;
  clobBaseUrl: string;
  wsUrl: string;
  chainId: number;
  rateLimitCapacity: number;
  rateLimitRefillIntervalMs: number;
  ingestMock: boolean;
  ingestRegion: string;
};

export function getPolymarketConfig(): PolymarketConfig {
  const enabledRaw = process.env.POLYMARKET_ENABLED?.trim().toLowerCase();
  const enabled = enabledRaw === "true" || enabledRaw === "1";

  return {
    enabled,
    clobBaseUrl: optional("POLYMARKET_CLOB_BASE_URL", "https://clob.polymarket.com").replace(
      /\/$/,
      "",
    ),
    wsUrl: optional(
      "POLYMARKET_WS_URL",
      "wss://ws-subscriptions-clob.polymarket.com/ws/market",
    ),
    chainId: Number.parseInt(optional("POLYMARKET_CHAIN_ID", "137"), 10),
    rateLimitCapacity: Number.parseInt(optional("POLYMARKET_RATE_LIMIT_CAPACITY", "30"), 10),
    rateLimitRefillIntervalMs: Number.parseInt(
      optional("POLYMARKET_RATE_LIMIT_REFILL_MS", "200"),
      10,
    ),
    ingestMock: process.env.POLYMARKET_INGEST_MOCK?.trim().toLowerCase() === "true",
    ingestRegion: optional("CANVAS_PM_INGEST_REGION", "eu-west-2"),
  };
}

export function isPolymarketEnabled(): boolean {
  return getPolymarketConfig().enabled;
}
