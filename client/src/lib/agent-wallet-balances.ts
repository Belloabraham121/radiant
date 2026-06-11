import type { AgentChainId } from "@/lib/agent-chains";
import { getEvmDefaultChainId } from "@/lib/chain-meta";
import { fetchWalletBalances } from "@/lib/wallet-api";

export type LoadedChainBalance = {
  balanceDisplay: number;
  nativeSymbol: string;
  funded: boolean;
};

export async function loadAgentChainBalance(
  chainId: AgentChainId,
): Promise<LoadedChainBalance> {
  const options =
    chainId === "ethereum" ? { evmChainId: getEvmDefaultChainId() } : undefined;

  const data = await fetchWalletBalances(chainId, options);
  return {
    balanceDisplay: data.balance_display,
    nativeSymbol: data.native_symbol,
    funded: data.funded,
  };
}
