import type { AgentChainId } from "./agent-chains";
import type { WalletAssetsData } from "./wallet-assets-api";

const walletAssetsByKey = new Map<string, WalletAssetsData>();

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

/** Clear all wallet UI caches (e.g. on logout). */
export function clearWalletSessionCache(): void {
  walletAssetsByKey.clear();
}
