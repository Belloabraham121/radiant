import { AppError } from "../../errors/app-error.js";
import { resolveEvmChainId } from "../../config/evm.js";
import type { PrivyChain } from "./privy-balance.types.js";

const EVM_CHAIN_ID_TO_PRIVY: Record<number, PrivyChain> = {
  1: "ethereum",
  8453: "base",
  137: "polygon",
  42161: "arbitrum",
  10: "optimism",
  324: "zksync_era",
  11155111: "sepolia",
  84532: "base_sepolia",
  421614: "arbitrum_sepolia",
  11155420: "optimism_sepolia",
  80002: "polygon_amoy",
};

export function evmChainIdToPrivyChain(evmChainId?: number): PrivyChain {
  const resolved = resolveEvmChainId(evmChainId);
  const privyChain = EVM_CHAIN_ID_TO_PRIVY[resolved];
  if (!privyChain) {
    throw new AppError(
      400,
      "PRIVY_CHAIN_UNSUPPORTED",
      `EVM chain ${resolved} is not mapped for Privy balance queries.`,
    );
  }
  return privyChain;
}

export function resolvePrivyEvmChainId(evmChainId?: number): number {
  return resolveEvmChainId(evmChainId);
}
