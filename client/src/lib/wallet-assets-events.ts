import type { AgentChainId } from "./agent-chains";
import { invalidateWalletAssetsCache, walletAssetsCacheKey } from "./wallet-session-cache";

type WalletAssetsListener = (chainId: AgentChainId) => void;

const listeners = new Set<WalletAssetsListener>();

export function subscribeWalletAssetsInvalidation(listener: WalletAssetsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop cached assets for a chain and notify listeners to refetch if mounted. */
export function invalidateWalletAssetsForChain(
  chainId: AgentChainId,
  evmChainId?: number,
): void {
  invalidateWalletAssetsCache(walletAssetsCacheKey(chainId, evmChainId));
  for (const listener of listeners) {
    listener(chainId);
  }
}
