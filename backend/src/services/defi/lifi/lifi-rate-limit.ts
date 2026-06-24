import { tryConsumeTokenBucket } from "../../../infrastructure/rate-limit/token-bucket.js";
import { optional } from "../../../config/optional-env.js";
import { getLifiConfig } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";

const STATUS_POLL_BUCKET = {
  capacity: 1,
  refillIntervalMs: Number.parseInt(optional("LIFI_STATUS_POLL_REFILL_MS", "10000"), 10),
};

const EXECUTE_BUCKET = {
  capacity: Number.parseInt(optional("LIFI_EXECUTE_RATE_LIMIT_CAPACITY", "5"), 10),
  refillIntervalMs: Number.parseInt(optional("LIFI_EXECUTE_RATE_LIMIT_REFILL_MS", "3600000"), 10),
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
  const allowed = await tryConsumeTokenBucket(key, STATUS_POLL_BUCKET);
  if (!allowed) {
    throw new AppError(
      429,
      "LIFI_RATE_LIMITED",
      "Status polling is limited to once every 10 seconds per transaction.",
      { tx_hash: txHash },
    );
  }
}

/** Cross-chain execute — default 5 per user per hour. */
export async function consumeLifiExecuteQuota(userId: string): Promise<void> {
  const allowed = await tryConsumeTokenBucket(`lifi:execute:${userId}`, EXECUTE_BUCKET);
  if (!allowed) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Cross-chain execution rate limit exceeded. Try again later.",
    );
  }
}
