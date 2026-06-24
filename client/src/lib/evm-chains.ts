/** v1 EVM networks — mirror backend `ENABLED_EVM_CHAIN_IDS`. */

export type EvmNetworkMeta = {
  chainId: number;
  label: string;
  nativeSymbol: string;
};

const EVM_NETWORK_META: Record<number, EvmNetworkMeta> = {
  1: { chainId: 1, label: "Ethereum", nativeSymbol: "ETH" },
  42161: { chainId: 42161, label: "Arbitrum", nativeSymbol: "ETH" },
  8453: { chainId: 8453, label: "Base", nativeSymbol: "ETH" },
};

const DEFAULT_ENABLED_EVM_CHAIN_IDS = [1, 42161, 8453] as const;

function parseEnabledEvmChainIds(): number[] {
  const raw = process.env.NEXT_PUBLIC_ENABLED_EVM_CHAIN_IDS?.trim();
  if (!raw) {
    return [...DEFAULT_ENABLED_EVM_CHAIN_IDS];
  }

  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => Number.isInteger(id) && id > 0);

  return ids.length > 0 ? ids : [...DEFAULT_ENABLED_EVM_CHAIN_IDS];
}

/** Enabled EVM chain ids for balances, assets, and explorer links. */
export function getEnabledEvmChainIds(): number[] {
  return parseEnabledEvmChainIds();
}

export function getEvmNetworkMeta(chainId: number): EvmNetworkMeta {
  return (
    EVM_NETWORK_META[chainId] ?? {
      chainId,
      label: `EVM ${chainId}`,
      nativeSymbol: "ETH",
    }
  );
}

export function getEnabledEvmNetworks(): EvmNetworkMeta[] {
  return getEnabledEvmChainIds().map((chainId) => getEvmNetworkMeta(chainId));
}

/** Block explorer account URL for a specific EVM chain id. */
export function evmExplorerAccountUrl(chainId: number, address: string): string | null {
  if (!address) return null;
  switch (chainId) {
    case 1:
      return `https://etherscan.io/address/${address}`;
    case 8453:
      return `https://basescan.org/address/${address}`;
    case 42161:
      return `https://arbiscan.io/address/${address}`;
    default:
      return null;
  }
}
