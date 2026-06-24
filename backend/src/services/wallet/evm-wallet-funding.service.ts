import { getEnabledEvmChainIds } from "../../config/evm.js";
import { getEvmAdapterBalance } from "../chains/adapters/evm.js";
import { fetchEvmPrivyWalletAssets } from "./privy-balance.service.js";

function hasNonZeroAssets(
  assets: Awaited<ReturnType<typeof fetchEvmPrivyWalletAssets>>["assets"],
): boolean {
  return assets.some((asset) => asset.balance_atomic !== "0");
}

/** True when native ETH or any tracked Privy asset is non-zero on one EVM network. */
export async function isEvmNetworkFunded(
  address: string,
  evmChainId: number,
  privyWalletId?: string,
): Promise<boolean> {
  try {
    const native = await getEvmAdapterBalance(address, evmChainId);
    if (native.funded) {
      return true;
    }
  } catch {
    // Fall through to token balances when RPC fails.
  }

  if (!privyWalletId) {
    return false;
  }

  try {
    const { assets } = await fetchEvmPrivyWalletAssets(privyWalletId, {
      evmChainId,
      includeUsd: false,
    });
    return hasNonZeroAssets(assets);
  } catch {
    return false;
  }
}

/** Funded on any enabled EVM network (native or token balance). */
export async function isEvmWalletFundedAnyNetwork(
  address: string,
  privyWalletId?: string,
): Promise<boolean> {
  const chainIds = getEnabledEvmChainIds();
  const results = await Promise.all(
    chainIds.map((evmChainId) => isEvmNetworkFunded(address, evmChainId, privyWalletId)),
  );
  return results.some(Boolean);
}

/** Per-network funded flags for enabled EVM chain ids. */
export async function getEvmFundedByNetwork(
  address: string,
  privyWalletId?: string,
): Promise<Record<number, boolean>> {
  const chainIds = getEnabledEvmChainIds();
  const entries = await Promise.all(
    chainIds.map(async (evmChainId) => [
      evmChainId,
      await isEvmNetworkFunded(address, evmChainId, privyWalletId),
    ] as const),
  );
  return Object.fromEntries(entries);
}
