import { isSquidEnabled } from "../../../config/squid.js";
import { tokenizeMessage } from "../swap/text-tokenize.js";

const BRIDGE_VERBS = new Set(["bridge", "cross-chain", "crosschain"]);
const SWAP_VERBS = new Set(["swap", "convert", "trade", "exchange"]);
const MOVE_VERBS = new Set(["transfer", "move", "send"]);

export type SquidTestIntentMode = "bridge" | "swap";

/** Dev-only Squid chat intent — requires Squid integration to be configured. */
export function isSquidIntentTestEnabled(): boolean {
  if (process.env.SQUID_INTENT_TEST_ENABLED?.trim() !== "true") {
    return false;
  }
  return isSquidEnabled();
}

function firstNonSquidToken(tokens: readonly string[]): string | undefined {
  if (tokens.length === 0 || tokens[0] !== "squid") {
    return tokens[0];
  }
  return tokens[1];
}

function looksLikeBridgeVerb(tokens: readonly string[]): boolean {
  const first = firstNonSquidToken(tokens);
  if (!first) {
    return false;
  }
  if (BRIDGE_VERBS.has(first)) {
    return true;
  }
  if (first === "cross") {
    const idx = tokens[0] === "squid" ? 1 : 0;
    return tokens[idx + 1] === "chain";
  }
  return MOVE_VERBS.has(first);
}

function looksLikeSwapVerb(tokens: readonly string[]): boolean {
  const first = firstNonSquidToken(tokens);
  return first !== undefined && SWAP_VERBS.has(first);
}

/** Whether the message starts with a Squid test prefix and names bridge or swap mode. */
export function messageLooksLikeSquidTestIntent(message: string): boolean {
  if (!isSquidIntentTestEnabled()) {
    return false;
  }
  const tokens = tokenizeMessage(message);
  if (tokens.length === 0 || tokens[0] !== "squid") {
    return false;
  }
  return detectSquidTestMode(message) !== null;
}

export function detectSquidTestMode(message: string): SquidTestIntentMode | null {
  const tokens = tokenizeMessage(message);
  if (tokens.length === 0 || tokens[0] !== "squid") {
    return null;
  }
  if (looksLikeBridgeVerb(tokens)) {
    return "bridge";
  }
  if (looksLikeSwapVerb(tokens)) {
    return "swap";
  }
  return null;
}

/** Remove the leading `squid` token so bridge/swap parsers see a normal intent phrase. */
export function stripSquidTestPrefix(message: string): string {
  const tokens = tokenizeMessage(message);
  if (tokens.length === 0 || tokens[0] !== "squid") {
    return message.trim();
  }
  return tokens.slice(1).join(" ");
}
