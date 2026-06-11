import { getChainConfig, getEnabledChainConfigs } from "../../config/chains.js";
import type { ChainConfig } from "../../config/chains.js";
import { AppError } from "../../errors/app-error.js";
import { suiAdapter } from "./adapters/sui.js";
import type { ChainAdapter, ChainId } from "./types.js";
import { chainIdSchema } from "./types.js";

const adapters: Record<ChainId, ChainAdapter | undefined> = {
  sui: suiAdapter,
  ethereum: undefined,
  solana: undefined,
};

export function parseChainId(value: string): ChainId {
  const parsed = chainIdSchema.safeParse(value.trim().toLowerCase());
  if (!parsed.success) {
    throw new AppError(400, "CHAIN_NOT_SUPPORTED", `Unsupported chain: ${value}`);
  }
  return parsed.data;
}

export function getAdapter(chainId: ChainId): ChainAdapter {
  const config = getChainConfig(chainId);
  if (!config) {
    throw new AppError(
      400,
      "CHAIN_NOT_ENABLED",
      `Chain "${chainId}" is not enabled. Set ENABLED_CHAINS in the environment.`,
    );
  }

  const adapter = adapters[chainId];
  if (!adapter) {
    throw new AppError(
      501,
      "CHAIN_ADAPTER_MISSING",
      `No adapter registered for chain "${chainId}"`,
    );
  }

  return adapter;
}

export function listEnabledChains(): ChainConfig[] {
  return getEnabledChainConfigs();
}

/** Test hook — register a mock adapter. */
export function setAdapterForTests(chainId: ChainId, adapter: ChainAdapter | undefined): void {
  adapters[chainId] = adapter;
}
