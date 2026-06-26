import { tryConsumeTokenBucket } from "../../../infrastructure/rate-limit/token-bucket.js";
import { getSquidConfig } from "../../../config/squid.js";
import { AppError } from "../../../errors/app-error.js";

function outboundBucketConfig() {
  const cfg = getSquidConfig();
  return {
    capacity: cfg.rateLimitCapacity,
    refillIntervalMs: cfg.rateLimitRefillIntervalMs,
  };
}

/** Global + per-user Squid outbound quota (catalog reads). */
export async function consumeSquidOutboundQuota(userId: string, cost = 1): Promise<void> {
  const config = outboundBucketConfig();
  const globalAllowed = await tryConsumeTokenBucket("squid:outbound:global", config, cost);
  if (!globalAllowed) {
    throw new AppError(429, "SQUID_RATE_LIMITED", "Squid is rate limiting; retry shortly.");
  }

  const userAllowed = await tryConsumeTokenBucket(`squid:outbound:user:${userId}`, config, cost);
  if (!userAllowed) {
    throw new AppError(429, "SQUID_RATE_LIMITED", "Squid is rate limiting; retry shortly.");
  }
}

/** Route quote calls (`getRoute`) — costs 2 tokens (heavier than catalog reads). */
export async function consumeSquidQuoteQuota(userId: string): Promise<void> {
  await consumeSquidOutboundQuota(userId, 2);
}
