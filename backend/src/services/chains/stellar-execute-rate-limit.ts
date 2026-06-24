import { tryConsumeTokenBucket } from "../../infrastructure/rate-limit/token-bucket.js";
import { optional } from "../../config/optional-env.js";
import { AppError } from "../../errors/app-error.js";

const STELLAR_EXECUTE_BUCKET = {
  capacity: Number.parseInt(optional("STELLAR_EXECUTE_RATE_LIMIT_CAPACITY", "10"), 10),
  refillIntervalMs: Number.parseInt(optional("STELLAR_EXECUTE_RATE_LIMIT_REFILL_MS", "6000"), 10),
};

/** Per-user token bucket for Stellar `execute_transaction` (default 10/min). */
export async function consumeStellarExecuteQuota(privyUserId: string): Promise<void> {
  const allowed = await tryConsumeTokenBucket(
    `stellar:execute:${privyUserId}`,
    STELLAR_EXECUTE_BUCKET,
  );
  if (!allowed) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Stellar transaction rate limit exceeded. Try again in a minute.",
    );
  }
}
