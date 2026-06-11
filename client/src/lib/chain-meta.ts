import type { AgentChainId } from "@/lib/agent-chains";

export type DepositRail = "sui-dapp-kit" | "evm-injected" | "solana-injected" | "direct-only";

export type ChainMeta = {
  id: AgentChainId;
  label: string;
  nativeSymbol: string;
  /** Personal-wallet deposit rail for this agent chain family. */
  depositRail: DepositRail;
  /** Hint shown when the browser wallet rail is unavailable. */
  depositFallbackHint: string;
};

export const CHAIN_META: Record<AgentChainId, ChainMeta> = {
  sui: {
    id: "sui",
    label: "Sui",
    nativeSymbol: "SUI",
    depositRail: "sui-dapp-kit",
    depositFallbackHint: "Install Sui Wallet or Slush, or send SUI to the address below.",
  },
  ethereum: {
    id: "ethereum",
    label: "EVM",
    nativeSymbol: "ETH",
    depositRail: "evm-injected",
    depositFallbackHint:
      "Install Brave Wallet or MetaMask, or send ETH on your chosen network to the address below.",
  },
  solana: {
    id: "solana",
    label: "Solana",
    nativeSymbol: "SOL",
    depositRail: "solana-injected",
    depositFallbackHint:
      "Install Phantom or use Brave’s Solana wallet, or send SOL to the address below.",
  },
};

export function getChainMeta(chainId: AgentChainId): ChainMeta {
  return CHAIN_META[chainId];
}

/** Default EVM network for agent balance/deposits (mirror backend EVM_DEFAULT_CHAIN_ID). */
export function getEvmDefaultChainId(): number {
  const raw = process.env.NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function formatChainAddress(chainId: AgentChainId, address: string): string {
  if (chainId === "sui") {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }
  if (chainId === "ethereum") {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
