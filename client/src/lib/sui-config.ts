import { formatAddress } from "@mysten/sui/utils";
import { USER } from "@/lib/app-data";

export type SuiNetwork = "mainnet" | "testnet" | "devnet";

export const GRPC_URLS: Record<SuiNetwork, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

export const NETWORK_LABELS: Record<SuiNetwork, string> = {
  mainnet: "Sui Mainnet",
  testnet: "Sui Testnet",
  devnet: "Sui Devnet",
};

export function getDefaultNetwork(): SuiNetwork {
  const raw = process.env.NEXT_PUBLIC_SUI_NETWORK;
  if (raw === "mainnet" || raw === "testnet" || raw === "devnet") return raw;
  return "testnet";
}

/** Agent wallet address — override via env when backend provisions a real keypair. */
export function getAgentWalletAddress(): string {
  return process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS ?? USER.walletFull;
}

export function getAgentWalletShort(): string {
  return formatAddress(getAgentWalletAddress());
}

export function mistToSui(mist: bigint | string | number): number {
  const value = typeof mist === "bigint" ? mist : BigInt(mist);
  return Number(value) / 1_000_000_000;
}
