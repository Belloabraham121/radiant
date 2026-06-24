import type { ChainId } from "../../chains/types.js";
import { getEnabledEvmChainIds } from "../../../config/evm.js";
import { getEnabledChainConfigs } from "../../../config/chains.js";
import type { PartialSwapIntent } from "./swap-intent.types.js";
import { SWAP_KNOWN_COINS } from "./swap-intent.types.js";
import { parsePositiveNumber, tokenizeMessage } from "./text-tokenize.js";

const SWAP_VERBS = new Set(["swap", "convert", "trade", "exchange"]);
const DIRECTION_WORDS = new Set(["to", "for", "into"]);
const HYPOTHETICAL_MARKERS = [
  "what if",
  "what would",
  "what happens",
  "what can",
  "how do",
  "how would",
  "explain",
  "tell me",
  "walk me through",
  "if i",
];

const CHAIN_TOKEN_TO_ID: Record<string, ChainId> = {
  sui: "sui",
  solana: "solana",
  sol: "solana",
  stellar: "stellar",
  xlm: "stellar",
  ethereum: "ethereum",
  eth: "ethereum",
  evm: "ethereum",
  base: "ethereum",
  arbitrum: "ethereum",
  polygon: "ethereum",
};

const EVM_NAME_TO_CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  eth: 1,
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
};

function stripSwapVerb(tokens: readonly string[]): string[] {
  if (tokens.length === 0) {
    return [];
  }
  if (SWAP_VERBS.has(tokens[0])) {
    return [...tokens.slice(1)];
  }
  return [...tokens];
}

function findCoinSymbol(token: string): string | undefined {
  const upper = token.toUpperCase();
  if ((SWAP_KNOWN_COINS as readonly string[]).includes(upper)) {
    return upper;
  }
  return undefined;
}

function findDirectionIndex(tokens: readonly string[]): number {
  for (let index = 0; index < tokens.length; index += 1) {
    if (DIRECTION_WORDS.has(tokens[index])) {
      return index;
    }
  }
  return -1;
}

function resolveChainFromToken(token: string): { chainId: ChainId; evmChainId?: number } | null {
  const chainId = CHAIN_TOKEN_TO_ID[token];
  if (!chainId) {
    return null;
  }
  if (chainId === "ethereum") {
    const evmChainId = EVM_NAME_TO_CHAIN_ID[token];
    if (evmChainId !== undefined && getEnabledEvmChainIds().includes(evmChainId)) {
      return { chainId, evmChainId };
    }
    if (token === "ethereum" || token === "eth" || token === "evm") {
      return { chainId };
    }
    return { chainId, evmChainId: getEnabledEvmChainIds()[0] };
  }
  return { chainId };
}

function extractChainHint(tokens: readonly string[]): {
  chainId?: ChainId;
  evmChainId?: number;
  remaining: string[];
} {
  const remaining: string[] = [];
  let chainId: ChainId | undefined;
  let evmChainId: number | undefined;
  let expectChainAfterOn = false;

  for (const token of tokens) {
    if (token === "on" || token === "chain") {
      expectChainAfterOn = true;
      continue;
    }

    const isKnownCoin = findCoinSymbol(token) !== undefined;
    const resolved =
      !isKnownCoin || expectChainAfterOn ? resolveChainFromToken(token) : null;
    expectChainAfterOn = false;

    if (resolved && !chainId) {
      chainId = resolved.chainId;
      evmChainId = resolved.evmChainId;
      continue;
    }
    remaining.push(token);
  }

  return { chainId, evmChainId, remaining };
}

function parseDirectionSwap(rest: readonly string[]): Partial<PartialSwapIntent> {
  const directionIndex = findDirectionIndex(rest);
  if (directionIndex < 0) {
    return {};
  }

  const before = rest.slice(0, directionIndex);
  const after = rest.slice(directionIndex + 1);

  let inputCoin: string | undefined;
  let outputCoin: string | undefined;
  let amount: number | undefined;
  let amountSide: "pay" | "receive" | undefined;

  for (const token of before) {
    const coin = findCoinSymbol(token);
    const num = parsePositiveNumber(token);
    if (coin && !inputCoin) {
      inputCoin = coin;
    } else if (num !== undefined && amount === undefined) {
      amount = num;
      amountSide = "pay";
    }
  }

  for (const token of after) {
    const coin = findCoinSymbol(token);
    const num = parsePositiveNumber(token);
    if (coin && !outputCoin) {
      outputCoin = coin;
    } else if (num !== undefined && amount === undefined) {
      amount = num;
      amountSide = "receive";
    }
  }

  return { inputCoin, outputCoin, amount, amountSide };
}

function parseUndirectedSwap(rest: readonly string[]): Partial<PartialSwapIntent> {
  const coins: string[] = [];
  let amount: number | undefined;

  for (const token of rest) {
    const coin = findCoinSymbol(token);
    const num = parsePositiveNumber(token);
    if (coin) {
      coins.push(coin);
    } else if (num !== undefined) {
      amount = num;
    }
  }

  if (coins.length === 1 && rest.includes("to")) {
    return { outputCoin: coins[0], amount, amountSide: amount !== undefined ? "receive" : undefined };
  }

  return {
    inputCoin: coins[0],
    outputCoin: coins[1],
    amount,
    amountSide: amount !== undefined ? "pay" : undefined,
  };
}

export function isHypotheticalSwapMessage(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("?")) {
    return true;
  }
  return HYPOTHETICAL_MARKERS.some((marker) => lower.includes(marker));
}

export function messageLooksLikeSwap(message: string): boolean {
  const tokens = tokenizeMessage(message);
  return tokens.some((token) => SWAP_VERBS.has(token));
}

/** Extract swap slots from natural language without regex. */
export function parsePartialSwapIntent(message: string): PartialSwapIntent | null {
  if (!messageLooksLikeSwap(message)) {
    return null;
  }
  if (isHypotheticalSwapMessage(message)) {
    return null;
  }

  const tokens = tokenizeMessage(message);
  const afterVerb = stripSwapVerb(tokens);
  const { chainId, evmChainId, remaining } = extractChainHint(afterVerb);

  const directed = parseDirectionSwap(remaining);
  const undirected =
    directed.inputCoin || directed.outputCoin ? directed : parseUndirectedSwap(remaining);

  const intent: PartialSwapIntent = {
    originalMessage: message.trim(),
    ...undirected,
    chainId,
    evmChainId,
  };

  if (
    intent.amount === undefined &&
    intent.inputCoin === undefined &&
    intent.outputCoin === undefined
  ) {
    return null;
  }

  return intent;
}

export function isSwapIntentComplete(intent: PartialSwapIntent): boolean {
  return (
    intent.amount !== undefined &&
    Boolean(intent.inputCoin) &&
    Boolean(intent.outputCoin) &&
    Boolean(intent.chainId)
  );
}

/** Default chain when only one swap-capable network is enabled. */
export function inferDefaultSwapChain(): { chainId: ChainId; evmChainId?: number } | null {
  const enabled = getEnabledChainConfigs().filter((config) => config.enabled);
  const swapChains = enabled.filter((config) =>
    (["sui", "ethereum", "solana"] as ChainId[]).includes(config.id),
  );

  if (swapChains.length === 1) {
    const chainId = swapChains[0].id;
    if (chainId === "ethereum") {
      const evmIds = getEnabledEvmChainIds();
      return { chainId, evmChainId: evmIds[0] };
    }
    return { chainId };
  }

  return null;
}

export function withDefaultChain(intent: PartialSwapIntent): PartialSwapIntent {
  if (intent.chainId) {
    return intent;
  }
  const defaultChain = inferDefaultSwapChain();
  if (!defaultChain) {
    return intent;
  }
  return {
    ...intent,
    chainId: defaultChain.chainId,
    evmChainId: defaultChain.evmChainId ?? intent.evmChainId,
  };
}
