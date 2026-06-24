import { tryConsumeTokenBucket } from "../../infrastructure/rate-limit/token-bucket.js";
import { AppError } from "../../errors/app-error.js";
import { getLifiConfig } from "../../config/lifi.js";
import { getSoroswapConfig } from "../../config/soroswap.js";
import { getSushiswapConfig } from "../../config/sushiswap.js";
import type { DeFiProviderId } from "./types.js";

type BucketConfig = {
  capacity: number;
  refillIntervalMs: number;
};

function bucketForProvider(providerId: DeFiProviderId): BucketConfig {
  switch (providerId) {
    case "evm-lifi": {
      const cfg = getLifiConfig();
      return {
        capacity: cfg.rateLimitCapacity,
        refillIntervalMs: cfg.rateLimitRefillIntervalMs,
      };
    }
    case "evm-sushiswap": {
      const cfg = getSushiswapConfig();
      return {
        capacity: cfg.rateLimitCapacity,
        refillIntervalMs: cfg.rateLimitRefillIntervalMs,
      };
    }
    case "stellar-soroswap": {
      const cfg = getSoroswapConfig();
      return {
        capacity: cfg.rateLimitCapacity,
        refillIntervalMs: cfg.rateLimitRefillIntervalMs,
      };
    }
    case "sui-deepbook":
    default:
      return { capacity: 60, refillIntervalMs: 1000 };
  }
}

/** Per-user DeFi provider outbound quota (wraps token-bucket). */
export async function consumeDefiProviderQuota(
  userId: string,
  providerId: DeFiProviderId,
  cost = 1,
): Promise<void> {
  const config = bucketForProvider(providerId);
  const allowed = await tryConsumeTokenBucket(`defi:${providerId}:${userId}`, config, cost);
  if (!allowed) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      `DeFi provider "${providerId}" quota exceeded. Try again shortly.`,
      { provider_id: providerId },
    );
  }
}
