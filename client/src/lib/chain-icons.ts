import type { AgentChainId } from "@/lib/agent-chains";

/** Chain family icons (DefiLlama CDN). */
export const CHAIN_ICON_URLS: Record<AgentChainId, string> = {
  sui: "https://icons.llamao.fi/icons/chains/rsz_sui.jpg",
  ethereum: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg",
  solana: "https://icons.llamao.fi/icons/chains/rsz_solana.jpg",
  stellar: "https://icons.llamao.fi/icons/chains/rsz_stellar.jpg",
};

/** Per-network icons for the shared EVM agent wallet. */
export const EVM_NETWORK_ICON_URLS: Record<number, string> = {
  1: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg",
  42161: "https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg",
  8453: "https://icons.llamao.fi/icons/chains/rsz_base.jpg",
};

export function getChainIconUrl(chainId: AgentChainId): string {
  return CHAIN_ICON_URLS[chainId];
}

export function getEvmNetworkIconUrl(chainId: number): string {
  return (
    EVM_NETWORK_ICON_URLS[chainId] ??
    "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg"
  );
}
