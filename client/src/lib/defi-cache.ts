import type { AgentChainId } from "./agent-chains";

export type SupportedChainEntry = {
  chain_id: AgentChainId;
  evm_chain_id?: number;
  name: string;
  native_symbol: string;
  swap_provider: string | null;
  bridge_provider: string | null;
  allowed_symbols: string[];
};

type SupportedChainsCache = {
  fetchedAt: number;
  chains: SupportedChainEntry[];
};

const SUPPORTED_CHAINS_TTL_MS = 5 * 60 * 1000;
let supportedChainsCache: SupportedChainsCache | undefined;

export function readSupportedChainsCache(): SupportedChainEntry[] | undefined {
  if (!supportedChainsCache) {
    return undefined;
  }
  if (Date.now() - supportedChainsCache.fetchedAt > SUPPORTED_CHAINS_TTL_MS) {
    supportedChainsCache = undefined;
    return undefined;
  }
  return supportedChainsCache.chains;
}

export function writeSupportedChainsCache(chains: SupportedChainEntry[]): void {
  supportedChainsCache = {
    fetchedAt: Date.now(),
    chains,
  };
}

export function clearSupportedChainsCache(): void {
  supportedChainsCache = undefined;
}
