import type { ChainId } from "../../chains/types.js";
import { getEnabledEvmChainIds } from "../../../config/evm.js";
import {
  isLifiCrossEcosystemPair,
  isLifiRadiantChain,
  type LifiRadiantChainId,
} from "../../../config/lifi-chains.js";
import {
  resolveEvmChainIdFromLabel,
  resolveNonEvmChainIdFromLabel,
} from "../../defi/lifi/lifi-endpoint-params.js";
import {
  getBridgeKnownSymbols,
  requiresSameTokenBridgeConfirmation,
  shouldAutoFillBridgeReceiveToken,
} from "../../../config/token-capabilities.js";
import type { AmountUnit, PartialBridgeIntent } from "./bridge-intent.types.js";
import { parseAmountFromTokens } from "../../market/resolve-user-amount.js";
import { tokenizeMessage } from "../swap/text-tokenize.js";

const BRIDGE_VERBS = new Set(["bridge", "cross-chain", "crosschain"]);
const MOVE_VERBS = new Set(["transfer", "move", "send"]);
const DIRECTION_FROM = "from";
const DIRECTION_TO = "to";
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

const CHAIN_HINT_TOKENS = new Set([
  "sui",
  "solana",
  "sol",
  "ethereum",
  "eth",
  "evm",
  "base",
  "arbitrum",
  "arb",
  "polygon",
  "mainnet",
]);

function findTokenIndex(tokens: readonly string[], word: string): number {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === word) {
      return index;
    }
  }
  return -1;
}

function stripBridgeVerb(tokens: readonly string[]): string[] {
  if (tokens.length === 0) {
    return [];
  }

  const rest = [...tokens];
  if (BRIDGE_VERBS.has(rest[0])) {
    rest.shift();
    return rest;
  }

  if (rest[0] === "cross" && rest[1] === "chain") {
    return rest.slice(2);
  }

  if (MOVE_VERBS.has(rest[0])) {
    return rest.slice(1);
  }

  return rest;
}

function findCoinSymbol(token: string): string | undefined {
  const upper = token.toUpperCase();
  if (getBridgeKnownSymbols().includes(upper)) {
    return upper;
  }
  return undefined;
}

function resolveChainFromToken(
  token: string,
  allowKnownCoinAsChain: boolean,
): { chainId: ChainId; evmChainId?: number } | null {
  const isKnownCoin = findCoinSymbol(token) !== undefined;
  if (isKnownCoin && !allowKnownCoinAsChain) {
    return null;
  }

  const nonEvm = resolveNonEvmChainIdFromLabel(token);
  if (nonEvm) {
    return { chainId: nonEvm };
  }

  const evmChainId = resolveEvmChainIdFromLabel(token);
  if (evmChainId !== undefined && getEnabledEvmChainIds().includes(evmChainId)) {
    return { chainId: "ethereum", evmChainId };
  }

  return null;
}

function parseChainSegment(
  segment: readonly string[],
  preferChain = false,
): { chainId?: ChainId; evmChainId?: number; remaining: string[] } {
  const remaining: string[] = [];
  let chainId: ChainId | undefined;
  let evmChainId: number | undefined;
  let expectChainAfterOn = false;

  for (const token of segment) {
    if (token === "on" || token === "chain") {
      expectChainAfterOn = true;
      continue;
    }

    if (preferChain && !chainId && !expectChainAfterOn) {
      const isKnownCoin = findCoinSymbol(token) !== undefined;
      const nonEvmChain = resolveNonEvmChainIdFromLabel(token);
      const chainNativeCoin =
        isKnownCoin &&
        (nonEvmChain !== undefined ||
          token.toUpperCase() === "SUI" ||
          token.toUpperCase() === "SOL");
      if (!isKnownCoin || chainNativeCoin) {
        const chainFirst = resolveChainFromToken(token, chainNativeCoin);
        if (chainFirst) {
          chainId = chainFirst.chainId;
          evmChainId = chainFirst.evmChainId;
          continue;
        }
      }
    }

    const isKnownCoin = findCoinSymbol(token) !== undefined;
    const resolved =
      !isKnownCoin || expectChainAfterOn ? resolveChainFromToken(token, expectChainAfterOn) : null;
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

function parseAmountAndToken(tokens: readonly string[]): {
  amount?: number;
  amountUnit?: AmountUnit;
  amountUnitConfirmed?: boolean;
  token?: string;
} {
  let amount: number | undefined;
  let amountUnit: AmountUnit | undefined;
  let token: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const value = tokens[index];
    const coin = findCoinSymbol(value);
    const parsed = parseAmountFromTokens(tokens, index);
    if (coin && !token) {
      token = coin;
    } else if (parsed && amount === undefined) {
      amount = parsed.parsed.value;
      amountUnit = parsed.parsed.unit;
      index += parsed.consumed - 1;
    }
  }

  return {
    amount,
    amountUnit,
    amountUnitConfirmed: amountUnit === "usd" ? true : undefined,
    token,
  };
}

function parseBridgeSegments(tokens: readonly string[]): {
  before: string[];
  fromSegment: string[];
  toSegment: string[];
} {
  const fromIdx = findTokenIndex(tokens, DIRECTION_FROM);
  let toIdx = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === DIRECTION_TO) {
      toIdx = index;
      break;
    }
  }

  if (fromIdx >= 0 && toIdx > fromIdx) {
    return {
      before: tokens.slice(0, fromIdx),
      fromSegment: tokens.slice(fromIdx + 1, toIdx),
      toSegment: tokens.slice(toIdx + 1),
    };
  }

  if (toIdx >= 0) {
    return {
      before: tokens.slice(0, toIdx),
      fromSegment: [],
      toSegment: tokens.slice(toIdx + 1),
    };
  }

  return { before: [...tokens], fromSegment: [], toSegment: [] };
}

function inferChainFromToken(token: string): { chainId: ChainId; evmChainId?: number } | null {
  const upper = token.toUpperCase();
  if (upper === "SUI") {
    return { chainId: "sui" };
  }
  if (upper === "SOL") {
    return { chainId: "solana" };
  }
  if (upper === "ETH" || upper === "WETH") {
    const evmIds = getEnabledEvmChainIds();
    if (evmIds.length === 1) {
      return { chainId: "ethereum", evmChainId: evmIds[0] };
    }
  }
  return null;
}

function hasChainHint(tokens: readonly string[]): boolean {
  return tokens.some((token) => CHAIN_HINT_TOKENS.has(token));
}

export function isHypotheticalBridgeMessage(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("?")) {
    return true;
  }
  return HYPOTHETICAL_MARKERS.some((marker) => lower.includes(marker));
}

export function messageLooksLikeBridge(message: string): boolean {
  const tokens = tokenizeMessage(message);
  if (tokens.some((token) => BRIDGE_VERBS.has(token))) {
    return true;
  }
  if (tokens.includes("cross") && tokens.includes("chain")) {
    return true;
  }
  if (tokens.some((token) => MOVE_VERBS.has(token)) && (tokens.includes("from") || tokens.includes("to") || hasChainHint(tokens))) {
    return true;
  }
  return false;
}

/** Extract bridge slots from natural language without regex. */
export function parsePartialBridgeIntent(message: string): PartialBridgeIntent | null {
  if (!messageLooksLikeBridge(message)) {
    return null;
  }
  if (isHypotheticalBridgeMessage(message)) {
    return null;
  }

  const tokens = tokenizeMessage(message);
  const afterVerb = stripBridgeVerb(tokens);
  const { before, fromSegment, toSegment } = parseBridgeSegments(afterVerb);

  const fromChainParsed = parseChainSegment(fromSegment, true);
  const toChainParsed = parseChainSegment(toSegment, true);
  const beforeParsed = parseAmountAndToken(before);

  let fromToken =
    findCoinSymbol(fromChainParsed.remaining[0] ?? "") ??
    beforeParsed.token ??
    findCoinSymbol(toChainParsed.remaining[0] ?? "");

  let toToken: string | undefined;
  const toRemaining = toChainParsed.remaining.filter((token) => findCoinSymbol(token) !== undefined);
  if (toRemaining.length > 0) {
    const candidate = findCoinSymbol(toRemaining[0]);
    if (candidate) {
      if (fromToken === undefined) {
        fromToken = candidate;
      } else {
        toToken = candidate;
      }
    }
  }

  const intent: PartialBridgeIntent = {
    originalMessage: message.trim(),
    amount: beforeParsed.amount,
    amountUnit: beforeParsed.amountUnit,
    amountUnitConfirmed: beforeParsed.amountUnitConfirmed,
    fromToken,
    toToken,
    fromChainId: fromChainParsed.chainId,
    fromEvmChainId: fromChainParsed.evmChainId,
    toChainId: toChainParsed.chainId,
    toEvmChainId: toChainParsed.evmChainId,
  };

  if (!intent.fromChainId && intent.fromToken) {
    const inferred = inferChainFromToken(intent.fromToken);
    if (inferred) {
      intent.fromChainId = inferred.chainId;
      intent.fromEvmChainId = inferred.evmChainId ?? intent.fromEvmChainId;
    }
  }

  if (
    intent.amount === undefined &&
    intent.fromToken === undefined &&
    intent.toToken === undefined &&
    intent.fromChainId === undefined &&
    intent.toChainId === undefined
  ) {
    return null;
  }

  inferObviousReceiveToken(intent, toChainParsed.remaining);

  return intent;
}

/** When the user names one token and two chains, schema-backed tokens auto-fill receive. */
export function inferObviousReceiveToken(
  intent: PartialBridgeIntent,
  destinationSegmentRemaining: readonly string[] = [],
): void {
  if (!intent.fromToken || !intent.fromChainId || !intent.toChainId) {
    return;
  }
  if (!isBridgeCrossChain(intent)) {
    return;
  }

  const from = {
    chain_id: intent.fromChainId,
    evm_chain_id: intent.fromEvmChainId,
  };
  const to = {
    chain_id: intent.toChainId,
    evm_chain_id: intent.toEvmChainId,
  };
  const symbol = intent.fromToken.toUpperCase();

  const destTokenMentioned = destinationSegmentRemaining.some(
    (token) => findCoinSymbol(token) !== undefined,
  );

  if (intent.toToken) {
    if (
      intent.toToken.toUpperCase() === symbol &&
      shouldAutoFillBridgeReceiveToken(symbol, from, to)
    ) {
      intent.confirmSameToken = true;
    }
    return;
  }

  if (destTokenMentioned) {
    return;
  }

  if (shouldAutoFillBridgeReceiveToken(symbol, from, to)) {
    intent.toToken = symbol;
    intent.confirmSameToken = true;
    return;
  }

  if (requiresSameTokenBridgeConfirmation(symbol, from, to)) {
    intent.toToken = symbol;
  }
}

function isBridgeCrossChain(intent: PartialBridgeIntent): boolean {
  if (!intent.fromChainId || !intent.toChainId) {
    return false;
  }
  if (intent.fromChainId !== intent.toChainId) {
    return true;
  }
  if (intent.fromChainId === "ethereum" && intent.toChainId === "ethereum") {
    return intent.fromEvmChainId !== intent.toEvmChainId;
  }
  return false;
}

export function needsSameTokenConfirmation(intent: PartialBridgeIntent): boolean {
  if (!intent.fromToken || !intent.toToken) {
    return false;
  }
  if (intent.confirmSameToken) {
    return false;
  }
  if (intent.fromToken.toUpperCase() !== intent.toToken.toUpperCase()) {
    return false;
  }
  if (!intent.fromChainId || !intent.toChainId) {
    return false;
  }
  if (!isLifiRadiantChain(intent.fromChainId) || !isLifiRadiantChain(intent.toChainId)) {
    return false;
  }
  return isLifiCrossEcosystemPair(intent.fromChainId, intent.toChainId);
}

export function isBridgeIntentComplete(intent: PartialBridgeIntent): boolean {
  if (!intent.fromChainId || !intent.toChainId) {
    return false;
  }
  if (intent.fromChainId === "ethereum" && intent.fromEvmChainId === undefined) {
    return false;
  }
  if (intent.toChainId === "ethereum" && intent.toEvmChainId === undefined) {
    return false;
  }
  if (!intent.fromToken || !intent.toToken || intent.amount === undefined) {
    return false;
  }
  if (!isBridgeCrossChain(intent)) {
    return false;
  }
  if (needsSameTokenConfirmation(intent)) {
    return false;
  }
  return true;
}

export function withDefaultBridgeChains(intent: PartialBridgeIntent): PartialBridgeIntent {
  return { ...intent };
}

export function isSameEvmChainBridgeIntent(intent: PartialBridgeIntent): boolean {
  if (intent.fromChainId !== "ethereum" || intent.toChainId !== "ethereum") {
    return false;
  }
  if (intent.fromEvmChainId === undefined || intent.toEvmChainId === undefined) {
    return false;
  }
  return intent.fromEvmChainId === intent.toEvmChainId;
}
