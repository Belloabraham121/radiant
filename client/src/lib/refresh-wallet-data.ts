import type { AgentChainId } from "@/lib/agent-chains";
import { getEnabledEvmChainIds, getEvmNetworkMeta } from "@/lib/evm-chains";
import { getEnabledEvmChainIds } from "@/lib/evm-chains";
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
  for (const evmChainId of getEnabledEvmChainIds()) {
    invalidateWalletAssetsForChain("ethereum", evmChainId);
  }
  invalidateWalletAssetsForChain("solana");
  invalidateWalletAssetsForChain("stellar");
}

export async function refreshAllWalletData(options: {
  refreshBalancesOnly: () => Promise<void>;
  enabledChains?: AgentChainId[];
}): Promise<void> {
  invalidateAllWalletCaches();
  await options.refreshBalancesOnly();
}
