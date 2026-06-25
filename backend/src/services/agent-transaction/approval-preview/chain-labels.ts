import { getEvmNetwork } from "../../../config/evm.js";
import type { LifiChainRef } from "../../../config/lifi-chains.js";
import type { ChainId } from "../../chains/types.js";

export function formatRadiantChainLabel(
  chainId: ChainId,
  evmChainId?: number,
): string {
  if (chainId === "sui") {
    return "Sui";
  }
  if (chainId === "solana") {
    return "Solana";
  }
  if (chainId === "stellar") {
    return "Stellar";
  }
  if (chainId === "ethereum" && evmChainId !== undefined) {
    return getEvmNetwork(evmChainId)?.name ?? `EVM ${evmChainId}`;
  }
  return chainId;
}

export function formatLifiChainRefLabel(ref: LifiChainRef): string {
  if (ref.chain_id === "ethereum") {
    return formatRadiantChainLabel("ethereum", ref.evm_chain_id);
  }
  return formatRadiantChainLabel(ref.chain_id);
}
