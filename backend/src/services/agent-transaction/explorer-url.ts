import type { ChainId } from "../chains/types.js";

function resolveEvmDefaultChainId(): number {
  const raw = process.env.EVM_DEFAULT_CHAIN_ID?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Block explorer URL for a submitted transaction digest/hash. */
export function buildExplorerTxUrl(chainId: ChainId, digest: string): string | null {
  if (!digest) {
    return null;
  }

  switch (chainId) {
    case "sui":
      return `https://suiscan.xyz/mainnet/tx/${digest}`;
    case "ethereum": {
      const evmChainId = resolveEvmDefaultChainId();
      if (evmChainId === 8453) {
        return `https://basescan.org/tx/${digest}`;
      }
      return `https://etherscan.io/tx/${digest}`;
    }
    case "solana":
      return `https://solscan.io/tx/${digest}`;
    default:
      return null;
  }
}
