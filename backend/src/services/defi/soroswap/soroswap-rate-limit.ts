import { tryConsumeTokenBucket } from "../../../infrastructure/rate-limit/token-bucket.js";
import { getSoroswapConfig } from "../../../config/soroswap.js";
import { AppError } from "../../../errors/app-error.js";

function outboundBucketConfig() {
  const cfg = getSoroswapConfig();
  return {
    capacity: cfg.rateLimitCapacity,
    refillIntervalMs: cfg.rateLimitRefillIntervalMs,
  };
}

/** Global + per-user Soroswap outbound quota (catalog reads). */
export async function consumeSoroswapOutboundQuota(userId: string, cost = 1): Promise<void> {
  const config = outboundBucketConfig();
  const globalAllowed = await tryConsumeTokenBucket("soroswap:outbound:global", config, cost);
  if (!globalAllowed) {
    throw new AppError(
      429,
      "SOROSWAP_RATE_LIMITED",
      "Stellar quotes are temporarily rate limited; try again shortly.",
    );
  }

  const userAllowed = await tryConsumeTokenBucket(`soroswap:outbound:user:${userId}`, config, cost);
  if (!userAllowed) {
    throw new AppError(
      429,
      "SOROSWAP_RATE_LIMITED",
      "Stellar quotes are temporarily rate limited; try again shortly.",
    );
  }
}

/** Quote calls (`POST /quote`) — costs 2 tokens (heavier than catalog reads). */
export async function consumeSoroswapQuoteQuota(userId: string): Promise<void> {
  await consumeSoroswapOutboundQuota(userId, 2);
}
