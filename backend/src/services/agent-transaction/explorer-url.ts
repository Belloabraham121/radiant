import type { ChainId } from "../chains/types.js";

function resolveEvmDefaultChainId(): number {
  const raw = process.env.EVM_DEFAULT_CHAIN_ID?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Block explorer transaction URL for a specific EVM chain id. */
export function evmExplorerTxUrl(evmChainId: number, hash: string): string | null {
  if (!hash) {
    return null;
  }
  switch (evmChainId) {
    case 1:
      return `https://etherscan.io/tx/${hash}`;
    case 8453:
      return `https://basescan.org/tx/${hash}`;
    case 42161:
      return `https://arbiscan.io/tx/${hash}`;
    default:
      return null;
  }
}

function evmExplorerLabel(evmChainId: number, options?: { compact?: boolean }): string {
  if (options?.compact) {
    return "Explorer";
  }
  switch (evmChainId) {
    case 1:
      return "View on Etherscan";
    case 8453:
      return "View on BaseScan";
    case 42161:
      return "View on Arbiscan";
    default:
      return "View on block explorer";
  }
}

/** Human-readable explorer link label for a chain (and optional EVM network). */
export function explorerLabelForChain(
  chainId: ChainId,
  evmChainId?: number,
  options?: { flashLoan?: boolean; compact?: boolean },
): string {
  if (options?.compact) {
    return "Explorer";
  }
  if (options?.flashLoan && chainId === "sui") {
    return "View flash loan on Sui Explorer";
  }
  switch (chainId) {
    case "sui":
      return "View on Sui Explorer";
    case "ethereum":
      return evmExplorerLabel(evmChainId ?? resolveEvmDefaultChainId(), options);
    case "solana":
      return "View on Solscan";
    case "stellar":
      return "View on Stellar Expert";
    default:
      return "View on block explorer";
  }
}

/** Block explorer URL for a submitted transaction digest/hash. */
export function buildExplorerTxUrl(
  chainId: ChainId,
  digest: string,
  evmChainId?: number,
): string | null {
  if (!digest) {
    return null;
  }

  switch (chainId) {
    case "sui":
      return `https://suiscan.xyz/mainnet/tx/${digest}`;
    case "ethereum":
      return evmExplorerTxUrl(evmChainId ?? resolveEvmDefaultChainId(), digest);
    case "solana":
      return `https://solscan.io/tx/${digest}`;
    case "stellar":
      return `https://stellar.expert/explorer/public/tx/${digest}`;
    default:
      return null;
  }
}
