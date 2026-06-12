import { getDeepBookEnv } from "../../config/deepbook.js";
import { getRedisClient } from "../../infrastructure/redis/client.js";
import type { WalletAssetsData, WalletAssetsQuery } from "./wallet-assets.types.js";

const memory = new Map<string, { value: WalletAssetsData; expiresAt: number }>();

export function walletAssetsCacheKey(privyUserId: string, query: WalletAssetsQuery): string {
  if (query.chain_id === "ethereum") {
    const evmId = query.evm_chain_id ?? "default";
    return `wallet-assets:${privyUserId}:ethereum:${evmId}`;
  }
  return `wallet-assets:${privyUserId}:${query.chain_id}`;
}

export async function getCachedWalletAssets(
  privyUserId: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData | null> {
  const key = walletAssetsCacheKey(privyUserId, query);
  const redis = getRedisClient();

  if (redis) {
    try {
      if (redis.status !== "ready") {
        await redis.connect();
      }
      const raw = await redis.get(key);
      if (raw) {
        return JSON.parse(raw) as WalletAssetsData;
      }
    } catch {
      // Fall through to memory cache.
    }
  }

  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

export async function setCachedWalletAssets(
  privyUserId: string,
  query: WalletAssetsQuery,
  data: WalletAssetsData,
): Promise<void> {
  const key = walletAssetsCacheKey(privyUserId, query);
  const ttlSec = getDeepBookEnv().walletAssetCacheTtlSec;
  const serialized = JSON.stringify(data);

  const redis = getRedisClient();
  if (redis) {
    try {
      if (redis.status !== "ready") {
        await redis.connect();
      }
      await redis.setex(key, ttlSec, serialized);
      return;
    } catch {
      // Fall through to memory cache.
    }
  }

  memory.set(key, {
    value: data,
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

/** Test hook — clear in-memory entries. */
export function clearWalletAssetsCacheForTests(): void {
  memory.clear();
}
