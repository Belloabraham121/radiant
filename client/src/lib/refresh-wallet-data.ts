import type { AgentChainId } from "@/lib/agent-chains";
import { getEvmDefaultChainId } from "@/lib/chain-meta";
import { invalidateWalletAssetsForChain } from "@/lib/wallet-assets-events";
import {
  invalidateDeepBookManagerCache,
  invalidateWalletAssetsCache,
} from "@/lib/wallet-session-cache";

/** Drop all client wallet caches and notify hooks to refetch live chain data. */
export function invalidateAllWalletCaches(): void {
  invalidateWalletAssetsCache();
  invalidateDeepBookManagerCache();
  invalidateWalletAssetsForChain("sui");
  invalidateWalletAssetsForChain("ethereum", getEvmDefaultChainId());
  invalidateWalletAssetsForChain("solana");
}

export async function refreshAllWalletData(options: {
  refreshBalancesOnly: () => Promise<void>;
  enabledChains?: AgentChainId[];
}): Promise<void> {
  invalidateAllWalletCaches();
  await options.refreshBalancesOnly();
}
