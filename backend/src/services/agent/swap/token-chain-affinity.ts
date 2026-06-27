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
  kind: "output_not_on_source" | "input_not_on_selected" | "neither_on_selected";
  sourceLabel: string;
  inputToken: string;
  outputToken: string;
  destination: TokenChainRef;
  outputDestinations: TokenChainRef[];
  /** Present when the input token is not on the network the user selected. */
  inputSource?: TokenChainRef;
  inputSources?: TokenChainRef[];
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
 * When the user picked a network but input/output tokens are not both available there,
 * and Li-Fi can bridge across ecosystems.
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

  const source = { chainId: filled.chainId, evmChainId: filled.evmChainId };
  const sourceLabel = formatChainLabel(filled.chainId, filled.evmChainId);
  const inputOnSelected = isTokenOnChain(
    filled.inputCoin,
    filled.chainId,
    filled.evmChainId,
  );
  const outputOnSelected = isTokenOnChain(
    filled.outputCoin,
    filled.chainId,
    filled.evmChainId,
  );

  if (inputOnSelected && outputOnSelected) {
    return null;
  }

  if (inputOnSelected && !outputOnSelected) {
    const outputDestinations = getChainsForToken(filled.outputCoin);
    const bridgeDestinations = outputDestinations.filter(
      (dest) =>
        !sameChainRef(source, dest) &&
        isLifiCrossEcosystemPair(source.chainId, dest.chainId),
    );

    if (bridgeDestinations.length === 0) {
      return null;
    }

    return {
      kind: "output_not_on_source",
      sourceLabel,
      inputToken: filled.inputCoin,
      outputToken: filled.outputCoin,
      destination: bridgeDestinations[0],
      outputDestinations: bridgeDestinations,
    };
  }

  if (!inputOnSelected && outputOnSelected) {
    const inputSources = getChainsForToken(filled.inputCoin).filter(
      (inputChain) =>
        !sameChainRef(source, inputChain) &&
        isLifiCrossEcosystemPair(inputChain.chainId, source.chainId),
    );

    if (inputSources.length === 0) {
      return null;
    }

    return {
      kind: "input_not_on_selected",
      sourceLabel,
      inputToken: filled.inputCoin,
      outputToken: filled.outputCoin,
      inputSource: inputSources[0],
      inputSources,
      destination: {
        chainId: filled.chainId,
        evmChainId: filled.evmChainId,
        label: sourceLabel,
      },
      outputDestinations: [],
    };
  }

  const inputSources = getChainsForToken(filled.inputCoin);
  const outputDestinations = getChainsForToken(filled.outputCoin);
  for (const inputChain of inputSources) {
    for (const outputChain of outputDestinations) {
      if (sameChainRef(inputChain, outputChain)) {
        continue;
      }
      if (!isLifiCrossEcosystemPair(inputChain.chainId, outputChain.chainId)) {
        continue;
      }
      if (sameChainRef(source, inputChain) || sameChainRef(source, outputChain)) {
        continue;
      }
      return {
        kind: "neither_on_selected",
        sourceLabel,
        inputToken: filled.inputCoin,
        outputToken: filled.outputCoin,
        inputSource: inputChain,
        inputSources,
        destination: outputChain,
        outputDestinations,
      };
    }
  }

  return null;
}

export function formatCrossChainBridgeConfirmQuestion(mismatch: CrossChainSwapMismatch): string {
  const { sourceLabel, inputToken, outputToken } = mismatch;

  if (mismatch.kind === "input_not_on_selected" && mismatch.inputSource) {
    return (
      `${inputToken} isn't on ${sourceLabel} — it's on ${mismatch.inputSource.label}. ` +
      `Did you mean to bridge ${inputToken} to ${outputToken} on ${sourceLabel}?`
    );
  }

  if (mismatch.kind === "neither_on_selected" && mismatch.inputSource) {
    return (
      `${inputToken} and ${outputToken} aren't both available on ${sourceLabel}. ` +
      `Did you mean to bridge from ${mismatch.inputSource.label} to ${mismatch.destination.label}?`
    );
  }

  const { outputDestinations } = mismatch;
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

  if (mismatch.kind === "input_not_on_selected" && mismatch.inputSource) {
    return {
      originalMessage: filled.originalMessage,
      fromChainId: mismatch.inputSource.chainId,
      fromEvmChainId: mismatch.inputSource.evmChainId,
      toChainId: filled.chainId,
      toEvmChainId: filled.evmChainId,
      fromToken: filled.inputCoin,
      toToken: filled.outputCoin,
      amount: filled.amount,
      amountUnit: filled.amountUnit,
      amountUnitConfirmed: filled.amountUnitConfirmed,
    };
  }

  const fromChainId = mismatch.inputSource?.chainId ?? filled.chainId;
  const fromEvmChainId = mismatch.inputSource?.evmChainId ?? filled.evmChainId;

  return {
    originalMessage: filled.originalMessage,
    fromChainId,
    fromEvmChainId,
    toChainId: mismatch.destination.chainId,
    toEvmChainId: mismatch.destination.evmChainId,
    fromToken: filled.inputCoin,
    toToken: filled.outputCoin,
    amount: filled.amount,
    amountUnit: filled.amountUnit,
    amountUnitConfirmed: filled.amountUnitConfirmed,
  };
}
