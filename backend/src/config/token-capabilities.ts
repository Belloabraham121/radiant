import { isLifiCrossEcosystemPair } from "./lifi-chains.js";
import { getSupportedChains } from "./supported-tokens.js";
import { isTokenOnChain } from "../services/agent/swap/token-chain-affinity.js";
import type { ChainId } from "../services/chains/types.js";

export type TokenIdentityKind =
  | "evm_native"
  | "fungible_by_symbol"
  | "chain_native"
  | "wrapped_native";

export type DefaultReceiveBehavior = "same_symbol" | "prompt" | "confirm_same";

export type TokenIdentity = {
  symbol: string;
  kind: TokenIdentityKind;
  default_receive: DefaultReceiveBehavior;
  agent_note: string;
};

export type BridgeChainRef = {
  chain_id: ChainId;
  evm_chain_id?: number;
};

export type BridgeTokenOption = {
  id: string;
  label: string;
};

export type BridgeCapabilitiesResult = {
  from: BridgeChainRef;
  to: BridgeChainRef;
  cross_chain: boolean;
  cross_ecosystem: boolean;
  receive_token_options: Array<{ symbol: string; identity: TokenIdentity | null }>;
  auto_fill_receive_token: string | null;
  requires_same_token_confirmation: boolean;
  notes: string[];
};

const TOKEN_IDENTITIES: Record<string, TokenIdentity> = {
  ETH: {
    symbol: "ETH",
    kind: "evm_native",
    default_receive: "same_symbol",
    agent_note:
      "Native ETH is the same logical asset on every EVM network; only the chain context changes.",
  },
  WETH: {
    symbol: "WETH",
    kind: "wrapped_native",
    default_receive: "same_symbol",
    agent_note: "Wrapped native ETH — different contract address per EVM chain.",
  },
  USDC: {
    symbol: "USDC",
    kind: "fungible_by_symbol",
    default_receive: "same_symbol",
    agent_note: "Same ticker on each chain; contract addresses differ per network.",
  },
  USDT: {
    symbol: "USDT",
    kind: "fungible_by_symbol",
    default_receive: "same_symbol",
    agent_note: "Same ticker on each chain; contract addresses differ per network.",
  },
  SUI: {
    symbol: "SUI",
    kind: "chain_native",
    default_receive: "confirm_same",
    agent_note:
      "Sui native coin. Receiving SUI on a non-Sui chain (or vice versa) needs explicit confirmation.",
  },
  SOL: {
    symbol: "SOL",
    kind: "chain_native",
    default_receive: "confirm_same",
    agent_note:
      "Solana native coin. Receiving SOL on a non-Solana chain (or vice versa) needs explicit confirmation.",
  },
  DEEP: {
    symbol: "DEEP",
    kind: "chain_native",
    default_receive: "prompt",
    agent_note: "Sui ecosystem token.",
  },
  WAL: {
    symbol: "WAL",
    kind: "chain_native",
    default_receive: "prompt",
    agent_note: "Sui ecosystem token.",
  },
  ARB: {
    symbol: "ARB",
    kind: "fungible_by_symbol",
    default_receive: "prompt",
    agent_note: "Arbitrum governance token — only on Arbitrum in v1.",
  },
};

/** Metadata for agent prompts and bridge_capabilities queries. */
export function getTokenIdentity(symbol: string): TokenIdentity | null {
  return TOKEN_IDENTITIES[symbol.trim().toUpperCase()] ?? null;
}

/** Symbols the bridge parser may recognize — derived from enabled bridge chains. */
export function getBridgeKnownSymbols(): string[] {
  const symbols = new Set<string>();
  for (const entry of getSupportedChains()) {
    if (!entry.bridge_provider) {
      continue;
    }
    for (const sym of entry.allowed_symbols) {
      symbols.add(sym);
    }
  }
  return [...symbols].sort();
}

function getTokensOnChain(ref: BridgeChainRef): string[] {
  for (const entry of getSupportedChains()) {
    if (entry.chain_id !== ref.chain_id) {
      continue;
    }
    if (ref.chain_id === "ethereum" && entry.evm_chain_id !== ref.evm_chain_id) {
      continue;
    }
    return [...entry.allowed_symbols];
  }
  return [];
}

function sameBridgeChain(a: BridgeChainRef, b: BridgeChainRef): boolean {
  if (a.chain_id !== b.chain_id) {
    return false;
  }
  if (a.chain_id === "ethereum") {
    return a.evm_chain_id === b.evm_chain_id;
  }
  return true;
}

function isCrossChainBridge(from: BridgeChainRef, to: BridgeChainRef): boolean {
  return !sameBridgeChain(from, to);
}

function sortReceiveSymbols(symbols: string[], fromToken?: string): string[] {
  const normalizedFrom = fromToken?.trim().toUpperCase();
  return [...symbols].sort((a, b) => {
    if (normalizedFrom) {
      if (a === normalizedFrom && b !== normalizedFrom) {
        return -1;
      }
      if (b === normalizedFrom && a !== normalizedFrom) {
        return 1;
      }
    }
    return a.localeCompare(b);
  });
}

function toBridgeTokenOptions(symbols: string[], fromToken?: string): BridgeTokenOption[] {
  const normalizedFrom = fromToken?.trim().toUpperCase();
  return sortReceiveSymbols(symbols, fromToken).map((symbol) => ({
    id: symbol,
    label: symbol === normalizedFrom ? `${symbol} (same as source)` : symbol,
  }));
}

/** Tokens allowlisted on the source chain (for from_token clarification). */
export function getBridgeSourceTokenOptions(
  fromChainId: ChainId,
  fromEvmChainId?: number,
): BridgeTokenOption[] {
  return getTokensOnChain({ chain_id: fromChainId, evm_chain_id: fromEvmChainId }).map(
    (symbol) => ({ id: symbol, label: symbol }),
  );
}

/**
 * Intersection of bridgeable tokens on source and destination chains.
 * Includes same-symbol receive (e.g. ETH Base → Arbitrum) when valid on both sides.
 */
export function getBridgeReceiveTokenOptions(
  fromChainId: ChainId,
  fromEvmChainId: number | undefined,
  toChainId: ChainId,
  toEvmChainId: number | undefined,
  fromToken?: string,
): BridgeTokenOption[] {
  const from: BridgeChainRef = { chain_id: fromChainId, evm_chain_id: fromEvmChainId };
  const to: BridgeChainRef = { chain_id: toChainId, evm_chain_id: toEvmChainId };

  const fromSet = new Set(getTokensOnChain(from));
  const intersection = getTokensOnChain(to).filter((symbol) => fromSet.has(symbol));

  return toBridgeTokenOptions(intersection, fromToken);
}

/** True when the receive token can be auto-filled to the same symbol without asking. */
export function shouldAutoFillBridgeReceiveToken(
  fromToken: string,
  from: BridgeChainRef,
  to: BridgeChainRef,
): boolean {
  if (!isCrossChainBridge(from, to)) {
    return false;
  }

  const symbol = fromToken.trim().toUpperCase();
  const identity = getTokenIdentity(symbol);
  if (!identity || identity.default_receive !== "same_symbol") {
    return false;
  }

  if (!isTokenOnChain(symbol, from.chain_id, from.evm_chain_id)) {
    return false;
  }
  if (!isTokenOnChain(symbol, to.chain_id, to.evm_chain_id)) {
    return false;
  }

  return true;
}

/** True when same-symbol cross-ecosystem receive needs explicit user confirmation. */
export function requiresSameTokenBridgeConfirmation(
  fromToken: string,
  from: BridgeChainRef,
  to: BridgeChainRef,
): boolean {
  if (!isCrossChainBridge(from, to)) {
    return false;
  }
  if (from.chain_id === to.chain_id) {
    return false;
  }

  const symbol = fromToken.trim().toUpperCase();
  const identity = getTokenIdentity(symbol);
  if (!identity || identity.default_receive !== "confirm_same") {
    return false;
  }

  return isLifiCrossEcosystemPair(from.chain_id, to.chain_id);
}

/** Agent query_bridge_capabilities / bridge_capabilities response. */
export function queryBridgeCapabilities(
  from: BridgeChainRef,
  to: BridgeChainRef,
  fromToken?: string,
): BridgeCapabilitiesResult {
  const crossChain = isCrossChainBridge(from, to);
  const crossEcosystem =
    crossChain &&
    from.chain_id !== to.chain_id &&
    isLifiCrossEcosystemPair(from.chain_id, to.chain_id);

  const fromSet = new Set(getTokensOnChain(from));
  const receiveSymbols = sortReceiveSymbols(
    getTokensOnChain(to).filter((symbol) => fromSet.has(symbol)),
    fromToken,
  );

  const notes: string[] = [];
  for (const symbol of receiveSymbols) {
    const identity = getTokenIdentity(symbol);
    if (identity?.agent_note) {
      notes.push(`${symbol}: ${identity.agent_note}`);
    }
  }

  let autoFill: string | null = null;
  let requiresConfirmation = false;
  if (fromToken) {
    const normalized = fromToken.trim().toUpperCase();
    if (shouldAutoFillBridgeReceiveToken(normalized, from, to)) {
      autoFill = normalized;
    }
    requiresConfirmation = requiresSameTokenBridgeConfirmation(normalized, from, to);
  }

  return {
    from,
    to,
    cross_chain: crossChain,
    cross_ecosystem: crossEcosystem,
    receive_token_options: receiveSymbols.map((symbol) => ({
      symbol,
      identity: getTokenIdentity(symbol),
    })),
    auto_fill_receive_token: autoFill,
    requires_same_token_confirmation: requiresConfirmation,
    notes,
  };
}
