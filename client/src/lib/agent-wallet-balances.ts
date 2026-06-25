import type { AgentChainId } from "@/lib/agent-chains";
import { getEvmDefaultChainId } from "@/lib/chain-meta";
import { getEnabledEvmChainIds } from "@/lib/evm-chains";
import { fetchWalletAssets } from "@/lib/wallet-assets-api";
import { fetchWalletBalances } from "@/lib/wallet-api";

export type LoadedChainBalance = {
  balanceDisplay: number;
  nativeSymbol: string;
  funded: boolean;
  /** Set for the shared EVM wallet — per-network funded flags. */
  evmFundedByNetwork?: Record<number, boolean>;
};

function networkHasFunds(
  nativeFunded: boolean,
  assets: Awaited<ReturnType<typeof fetchWalletAssets>>["assets"],
): boolean {
  if (nativeFunded) return true;
  return assets.some((asset) => asset.balance_atomic !== "0");
}

async function loadEvmAgentChainBalance(): Promise<LoadedChainBalance> {
  const chainIds = getEnabledEvmChainIds();
  const defaultChainId = getEvmDefaultChainId();
  const fundedByNetwork: Record<number, boolean> = {};
  let defaultBalance: LoadedChainBalance = {
    balanceDisplay: 0,
    nativeSymbol: "ETH",
    funded: false,
  };

  await Promise.all(
    chainIds.map(async (evmChainId) => {
      try {
        const [native, assets] = await Promise.all([
          fetchWalletBalances("ethereum", { evmChainId }),
          fetchWalletAssets("ethereum", {
            evmChainId,
            includeZero: false,
            includeUsd: false,
          }),
        ]);
        fundedByNetwork[evmChainId] = networkHasFunds(native.funded, assets.assets);
        if (evmChainId === defaultChainId) {
          defaultBalance = {
            balanceDisplay: native.balance_display,
            nativeSymbol: native.native_symbol,
            funded: fundedByNetwork[evmChainId],
          };
        }
      } catch {
        fundedByNetwork[evmChainId] = false;
      }
    }),
  );

  const anyFunded = Object.values(fundedByNetwork).some(Boolean);
  return {
    ...defaultBalance,
    funded: anyFunded,
    evmFundedByNetwork: fundedByNetwork,
  };
}

export async function loadAgentChainBalance(
  chainId: AgentChainId,
): Promise<LoadedChainBalance> {
  if (chainId === "ethereum") {
    return loadEvmAgentChainBalance();
  }

  const data = await fetchWalletBalances(chainId);
  return {
    balanceDisplay: data.balance_display,
    nativeSymbol: data.native_symbol,
    funded: data.funded,
  };
}
