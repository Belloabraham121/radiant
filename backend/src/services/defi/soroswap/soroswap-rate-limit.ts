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

/** Stellar swap execute — relaxed outside production (mirror Squid/Li-Fi). */
export async function consumeSoroswapExecuteQuota(userId: string): Promise<void> {
  const strict =
    process.env.SOROSWAP_EXECUTE_RATE_LIMIT_STRICT?.trim() === "true" ||
    process.env.NODE_ENV === "production";
  if (!strict) {
    return;
  }

  const config = outboundBucketConfig();
  const key = `soroswap:execute:${userId}:c${config.capacity}:r${config.refillIntervalMs}`;
  const allowed = await tryConsumeTokenBucket(key, config);
  if (!allowed) {
    throw new AppError(
      429,
      "SOROSWAP_RATE_LIMITED",
      "Stellar swap execution rate limit exceeded. Try again later.",
    );
  }
}
