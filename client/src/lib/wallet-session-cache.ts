import type { AgentChainId } from "./agent-chains";
import type { DeepBookManagerUiData } from "./deepbook-api";
import type { WalletAssetsData } from "./wallet-assets-api";
import { clearSupportedChainsCache } from "./defi-cache";
import { clearTokenMetadataCache } from "./token-metadata-cache";

type WalletAssetsCacheEntry = {
  data: WalletAssetsData;
  fetchedAt: number;
};

const walletAssetsByKey = new Map<string, WalletAssetsCacheEntry>();
let deepBookManagerCache: DeepBookManagerUiData | undefined;

/** Balances are live data — treat anything older than this as stale and refresh. */
export const WALLET_ASSETS_TTL_MS = 60_000;

export function walletAssetsCacheKey(
  chainId: AgentChainId,
  evmChainId?: number,
): string {
  if (chainId === "ethereum") {
    return `ethereum:${evmChainId ?? "default"}`;
  }
  return chainId;
}

export function readWalletAssetsCache(key: string): WalletAssetsData | undefined {
  return walletAssetsByKey.get(key)?.data;
}

/** Cache entry with its fetch timestamp, for stale-while-revalidate. */
export function readWalletAssetsCacheEntry(
  key: string,
): WalletAssetsCacheEntry | undefined {
  return walletAssetsByKey.get(key);
}

export function isWalletAssetsCacheStale(key: string): boolean {
  const entry = walletAssetsByKey.get(key);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > WALLET_ASSETS_TTL_MS;
}

export function writeWalletAssetsCache(key: string, data: WalletAssetsData): void {
  walletAssetsByKey.set(key, { data, fetchedAt: Date.now() });
}

export function invalidateWalletAssetsCache(key?: string): void {
  if (key) {
    walletAssetsByKey.delete(key);
    return;
  }
  walletAssetsByKey.clear();
}

export function readDeepBookManagerCache(): DeepBookManagerUiData | undefined {
  return deepBookManagerCache;
}

export function writeDeepBookManagerCache(data: DeepBookManagerUiData): void {
  deepBookManagerCache = data;
}

export function invalidateDeepBookManagerCache(): void {
  deepBookManagerCache = undefined;
}

/** Clear all wallet UI caches (e.g. on logout). */
export function clearWalletSessionCache(): void {
  walletAssetsByKey.clear();
  deepBookManagerCache = undefined;
  clearTokenMetadataCache();
  clearSupportedChainsCache();
}
