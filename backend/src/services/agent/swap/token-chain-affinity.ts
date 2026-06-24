import { getEvmNetwork } from "../../../config/evm.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { isLifiCrossEcosystemPair } from "../../../config/lifi-chains.js";
import { getSupportedChains } from "../../../config/supported-tokens.js";
import type { ChainId } from "../../chains/types.js";
import type { PartialBridgeIntent } from "../bridge/bridge-intent.types.js";
import { withDefaultChain } from "./swap-intent-parser.js";
import type { PartialSwapIntent } from "./swap-intent.types.js";

export type TokenChainRef = {
  chainId: ChainId;
  evmChainId?: number;
  label: string;
};

export type CrossChainSwapMismatch = {
  sourceLabel: string;
  outputToken: string;
  destination: TokenChainRef;
  outputDestinations: TokenChainRef[];
};

function formatChainLabel(chainId: ChainId, evmChainId?: number): string {
  if (chainId === "ethereum" && evmChainId !== undefined) {
    const network = getEvmNetwork(evmChainId);
    return network?.name ?? `EVM ${evmChainId}`;
  }
  if (chainId === "sui") {
    return "Sui";
  }
  if (chainId === "solana") {
    return "Solana";
  }
  return chainId;
}

function sameChainRef(
  a: { chainId: ChainId; evmChainId?: number },
  b: { chainId: ChainId; evmChainId?: number },
): boolean {
  if (a.chainId !== b.chainId) {
    return false;
  }
  if (a.chainId === "ethereum") {
    return a.evmChainId === b.evmChainId;
  }
  return true;
}

/** Chains where a token symbol is allowlisted in v1. */
export function getChainsForToken(symbol: string): TokenChainRef[] {
  const normalized = symbol.trim().toUpperCase();
  const chains: TokenChainRef[] = [];

  for (const entry of getSupportedChains()) {
    if (entry.allowed_symbols.includes(normalized)) {
      chains.push({
        chainId: entry.chain_id,
        evmChainId: entry.evm_chain_id,
        label: entry.name,
      });
    }
  }

  return chains;
}

export function isTokenOnChain(
  symbol: string,
  chainId: ChainId,
  evmChainId?: number,
): boolean {
  const normalized = symbol.trim().toUpperCase();

  for (const entry of getSupportedChains()) {
    if (entry.chain_id !== chainId) {
      continue;
    }
    if (chainId === "ethereum" && entry.evm_chain_id !== evmChainId) {
      continue;
    }
    return entry.allowed_symbols.includes(normalized);
  }

  return false;
}

/**
 * When the user picked a source network but the output token is not on that chain,
 * and Li-Fi can bridge to a chain that has the output token.
 */
export function detectCrossChainSwapIntent(
  intent: PartialSwapIntent,
): CrossChainSwapMismatch | null {
  if (!isLifiEnabled()) {
    return null;
  }

  const filled = withDefaultChain(intent);
  if (!filled.inputCoin || !filled.outputCoin || !filled.chainId) {
    return null;
  }
  if (filled.chainId === "ethereum" && filled.evmChainId === undefined) {
    return null;
  }

  if (isTokenOnChain(filled.outputCoin, filled.chainId, filled.evmChainId)) {
    return null;
  }

  if (!isTokenOnChain(filled.inputCoin, filled.chainId, filled.evmChainId)) {
    return null;
  }

  const outputDestinations = getChainsForToken(filled.outputCoin);
  if (outputDestinations.length === 0) {
    return null;
  }

  const source = { chainId: filled.chainId, evmChainId: filled.evmChainId };
  const bridgeDestinations = outputDestinations.filter(
    (dest) =>
      !sameChainRef(source, dest) &&
      isLifiCrossEcosystemPair(source.chainId, dest.chainId),
  );

  if (bridgeDestinations.length === 0) {
    return null;
  }

  return {
    sourceLabel: formatChainLabel(filled.chainId, filled.evmChainId),
    outputToken: filled.outputCoin,
    destination: bridgeDestinations[0],
    outputDestinations: bridgeDestinations,
  };
}

export function formatCrossChainBridgeConfirmQuestion(mismatch: CrossChainSwapMismatch): string {
  const { sourceLabel, outputToken, outputDestinations } = mismatch;
  if (outputDestinations.length === 1) {
    return (
      `This swap isn't supported on ${sourceLabel} — ${outputToken} is only on ${outputDestinations[0].label}. Did you mean to bridge?`
    );
  }
  return (
    `This swap isn't supported on ${sourceLabel} — ${outputToken} isn't available on this network. Did you mean to bridge?`
  );
}

export function swapIntentToBridgeIntent(
  intent: PartialSwapIntent,
  mismatch: CrossChainSwapMismatch,
): PartialBridgeIntent {
  const filled = withDefaultChain(intent);
  return {
    originalMessage: filled.originalMessage,
    fromChainId: filled.chainId,
    fromEvmChainId: filled.evmChainId,
    toChainId: mismatch.destination.chainId,
    toEvmChainId: mismatch.destination.evmChainId,
    fromToken: filled.inputCoin,
    toToken: filled.outputCoin,
    amount: filled.amount,
  };
}
