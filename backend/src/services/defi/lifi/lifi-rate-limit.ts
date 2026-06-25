import { tryConsumeTokenBucket } from "../../../infrastructure/rate-limit/token-bucket.js";
import { getLifiConfig } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";

const STATUS_POLL_BUCKET = () => {
  const cfg = getLifiConfig();
  return {
    capacity: 1,
    refillIntervalMs: cfg.statusPollRefillMs,
  };
};

const EXECUTE_BUCKET = () => {
  const cfg = getLifiConfig();
  return {
    capacity: cfg.executeRateLimitCapacity,
    refillIntervalMs: cfg.executeRateLimitRefillMs,
  };
};

function outboundBucketConfig() {
  const cfg = getLifiConfig();
  return {
    capacity: cfg.rateLimitCapacity,
    refillIntervalMs: cfg.rateLimitRefillIntervalMs,
  };
}

/** Global + per-user Li-Fi outbound quota (catalog, tools, connections). */
export async function consumeLifiOutboundQuota(userId: string, cost = 1): Promise<void> {
  const config = outboundBucketConfig();
  const globalAllowed = await tryConsumeTokenBucket("lifi:outbound:global", config, cost);
  if (!globalAllowed) {
    throw new AppError(429, "LIFI_RATE_LIMITED", "Li-Fi is rate limiting; retry shortly.");
  }

  const userAllowed = await tryConsumeTokenBucket(`lifi:outbound:user:${userId}`, config, cost);
  if (!userAllowed) {
    throw new AppError(429, "LIFI_RATE_LIMITED", "Li-Fi is rate limiting; retry shortly.");
  }
}

/** Quote-heavy calls (getQuote / getRoutes) — costs 2 tokens. */
export async function consumeLifiQuoteQuota(userId: string): Promise<void> {
  await consumeLifiOutboundQuota(userId, 2);
}

/** Status polling — max 1 request / 10s per txHash per user. */
export async function consumeLifiStatusQuota(userId: string, txHash: string): Promise<void> {
  const key = `lifi:status:${userId}:${txHash.toLowerCase()}`;
  const allowed = await tryConsumeTokenBucket(key, STATUS_POLL_BUCKET());
  if (!allowed) {
    throw new AppError(
      429,
      "LIFI_RATE_LIMITED",
      "Status polling is limited to once every 10 seconds per transaction.",
      { tx_hash: txHash },
    );
  }
}

/** Cross-chain execute — default 5/hour in production; relaxed in local dev. */
export async function consumeLifiExecuteQuota(userId: string): Promise<void> {
  const strict =
    process.env.LIFI_EXECUTE_RATE_LIMIT_STRICT?.trim() === "true" ||
    process.env.NODE_ENV === "production";
  if (!strict) {
    return;
  }

  const bucket = EXECUTE_BUCKET();
  const key = `lifi:execute:${userId}:c${bucket.capacity}:r${bucket.refillIntervalMs}`;
  const allowed = await tryConsumeTokenBucket(key, bucket);
  if (!allowed) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Cross-chain execution rate limit exceeded. Try again later.",
    );
  }
}
