import { isLifiCrossEcosystemPair } from "../../config/lifi-chains.js";
import { AppError } from "../../errors/app-error.js";
import type { ChainId } from "../chains/types.js";
import type { DeFiProviderId } from "./types.js";

export type SwapProvider = {
  id: DeFiProviderId;
  chain_id: ChainId | "evm";
  label: string;
};

const PROVIDERS: Record<DeFiProviderId, SwapProvider> = {
  "sui-deepbook": {
    id: "sui-deepbook",
    chain_id: "sui",
    label: "DeepBook V3",
  },
  "evm-lifi": {
    id: "evm-lifi",
    chain_id: "ethereum",
    label: "Li-Fi",
  },
  "evm-sushiswap": {
    id: "evm-sushiswap",
    chain_id: "ethereum",
    label: "SushiSwap",
  },
  "stellar-soroswap": {
    id: "stellar-soroswap",
    chain_id: "stellar",
    label: "Soroswap",
  },
};

export type GetProviderForSwapInput = {
  chain_id: ChainId;
  cross_chain?: boolean;
  from_chain_id?: ChainId;
  to_chain_id?: ChainId;
  evm_chain_id?: number;
};

function chainEcosystem(chainId: ChainId): "sui" | "evm" | "stellar" | "solana" {
  if (chainId === "ethereum") return "evm";
  return chainId;
}

function assertCrossEcosystemSupported(input: GetProviderForSwapInput): void {
  const from = input.from_chain_id ?? input.chain_id;
  const to = input.to_chain_id;
  if (!to || from === to) {
    return;
  }

  if (chainEcosystem(from) !== chainEcosystem(to)) {
    if (isLifiCrossEcosystemPair(from, to)) {
      return;
    }
    throw new AppError(
      400,
      "CROSS_ECOSYSTEM_NOT_SUPPORTED",
      `Cross-ecosystem routing from ${from} to ${to} is not supported in v1. ` +
        "Use same-ecosystem swaps or Li-Fi bridges between enabled networks.",
      { from_chain_id: from, to_chain_id: to },
    );
  }
}

function isLifiCrossChainInput(input: GetProviderForSwapInput): boolean {
  const from = input.from_chain_id ?? input.chain_id;
  const to = input.to_chain_id;
  if (!to || from === to) {
    return false;
  }
  return isLifiCrossEcosystemPair(from, to);
}

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

export function getDefaultSwapProvider(chainId: ChainId = "sui"): SwapProvider | null {
  if (chainId === "sui") {
    return PROVIDERS["sui-deepbook"];
  }
  if (chainId === "stellar") {
    return PROVIDERS["stellar-soroswap"];
  }
  if (chainId === "ethereum") {
    return PROVIDERS["evm-sushiswap"];
  }
  return null;
}

/** Deterministic provider selection for swap vs bridge flows. */
export function getProviderForSwap(input: GetProviderForSwapInput): SwapProvider {
  assertCrossEcosystemSupported(input);

  if (input.cross_chain || isLifiCrossChainInput(input)) {
    if (isLifiCrossChainInput(input) || input.chain_id === "ethereum" || input.from_chain_id === "ethereum") {
      return getSwapProvider("evm-lifi");
    }
    if (
      input.from_chain_id === "sui" ||
      input.from_chain_id === "solana" ||
      input.chain_id === "sui" ||
      input.chain_id === "solana"
    ) {
      return getSwapProvider("evm-lifi");
    }
    throw new AppError(
      404,
      "DEFI_ROUTE_NOT_FOUND",
      `No cross-chain provider for chain "${input.chain_id}".`,
      { chain_id: input.chain_id, cross_chain: true },
    );
  }

  switch (input.chain_id) {
    case "sui":
      return getSwapProvider("sui-deepbook");
    case "stellar":
      return getSwapProvider("stellar-soroswap");
    case "ethereum":
      return getSwapProvider("evm-sushiswap");
    default:
      throw new AppError(
        404,
        "DEFI_ROUTE_NOT_FOUND",
        `No swap provider for chain "${input.chain_id}".`,
        { chain_id: input.chain_id },
      );
  }
}

export function isFutureProviderId(id: string): boolean {
  return id === "evm-uniswap";
}
