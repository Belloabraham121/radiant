import { AppError } from "../../errors/app-error.js";
import type { DeFiProviderId } from "./types.js";

export type SwapProvider = {
  id: DeFiProviderId;
  chain_id: "sui";
  label: string;
};

const PROVIDERS: Record<DeFiProviderId, SwapProvider> = {
  "sui-deepbook": {
    id: "sui-deepbook",
    chain_id: "sui",
    label: "DeepBook V3",
  },
};

/** Future: `evm-uniswap`, etc. */
const FUTURE_PROVIDER_IDS = ["evm-uniswap"] as const;

export function listSwapProviders(): SwapProvider[] {
  return Object.values(PROVIDERS);
}

export function getSwapProvider(id: DeFiProviderId): SwapProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new AppError(404, "DEFI_PROVIDER_NOT_FOUND", `DeFi provider not found: ${id}`);
  }
  return provider;
}

export function getDefaultSwapProvider(chainId: "sui" = "sui"): SwapProvider | null {
  if (chainId !== "sui") return null;
  return PROVIDERS["sui-deepbook"];
}

export function isFutureProviderId(id: string): boolean {
  return (FUTURE_PROVIDER_IDS as readonly string[]).includes(id);
}
