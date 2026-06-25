import type { AgentChainId } from "./agent-chains";
import type { DeepBookManagerUiData } from "./deepbook-api";
import type { WalletAssetsData } from "./wallet-assets-api";
import { clearSupportedChainsCache } from "./defi-cache";
import { clearTokenMetadataCache } from "./token-metadata-cache";

const walletAssetsByKey = new Map<string, WalletAssetsData>();
let deepBookManagerCache: DeepBookManagerUiData | undefined;

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
  return walletAssetsByKey.get(key);
}

export function writeWalletAssetsCache(key: string, data: WalletAssetsData): void {
  walletAssetsByKey.set(key, data);
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
