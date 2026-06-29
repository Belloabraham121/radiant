import { tryConsumeTokenBucket } from "../../../../infrastructure/rate-limit/token-bucket.js";
import { getPolymarketConfig } from "./polymarket.config.js";

export async function consumePolymarketRestToken(cost = 1): Promise<boolean> {
  const config = getPolymarketConfig();
  return tryConsumeTokenBucket("polymarket:rest", {
    capacity: config.rateLimitCapacity,
    refillIntervalMs: config.rateLimitRefillIntervalMs,
  }, cost);
}
