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

const STATUS_POLL_BUCKET = () => ({
  capacity: 1,
  refillIntervalMs: 10_000,
});

/** Status polling — max 1 request / 10s per tx per user. */
export async function consumeSquidStatusQuota(userId: string, transactionId: string): Promise<void> {
  const key = `squid:status:${userId}:${transactionId.toLowerCase()}`;
  const allowed = await tryConsumeTokenBucket(key, STATUS_POLL_BUCKET());
  if (!allowed) {
    throw new AppError(
      429,
      "SQUID_RATE_LIMITED",
      "Status polling is limited to once every 10 seconds per transaction.",
      { transaction_id: transactionId },
    );
  }
}

/** Cross-chain execute — relaxed outside production (mirror Li-Fi). */
export async function consumeSquidExecuteQuota(userId: string): Promise<void> {
  const strict =
    process.env.SQUID_EXECUTE_RATE_LIMIT_STRICT?.trim() === "true" ||
    process.env.NODE_ENV === "production";
  if (!strict) {
    return;
  }

  const config = outboundBucketConfig();
  const key = `squid:execute:${userId}:c${config.capacity}:r${config.refillIntervalMs}`;
  const allowed = await tryConsumeTokenBucket(key, config);
  if (!allowed) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Cross-chain execution rate limit exceeded. Try again later.",
    );
  }
}
