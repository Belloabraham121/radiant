/** Split user text into lowercase tokens without regex. */
export function tokenizeMessage(message: string): string[] {
  const normalized = message.trim().toLowerCase();
  const tokens: string[] = [];
  let current = "";

  for (const char of normalized) {
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if (char === ",") {
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function parsePositiveNumber(token: string): number | undefined {
  const parsed = Number.parseFloat(token);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

const HEX_CHARS = new Set("0123456789abcdef");
const LOWER_BASE32_CHARS = new Set("abcdefghijklmnopqrstuvwxyz234567");
// Base58 lowercased: digits 1-9 plus a-z (uppercase L lowercases to "l").
const LOWER_BASE58_CHARS = new Set("123456789abcdefghijklmnopqrstuvwxyz");
const TRAILING_PUNCTUATION = new Set([".", "!", "?", ";", ":", ")", "'", '"']);

function everyCharIn(value: string, allowed: Set<string>): boolean {
  if (value.length === 0) {
    return false;
  }
  for (const char of value) {
    if (!allowed.has(char)) {
      return false;
    }
  }
  return true;
}

function stripTrailingPunctuation(token: string): string {
  let end = token.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(token[end - 1])) {
    end -= 1;
  }
  return token.slice(0, end);
}

/**
 * True when a lowercased message token looks like a wallet address rather than
 * a word — EVM/Sui (0x hex), Stellar (G + base32), or Solana (long base58).
 */
export function looksLikeWalletAddress(rawToken: string): boolean {
  const token = stripTrailingPunctuation(rawToken);

  if (token.startsWith("0x")) {
    const body = token.slice(2);
    return body.length >= 40 && body.length <= 64 && everyCharIn(body, HEX_CHARS);
  }

  if (token.length === 56 && token.startsWith("g")) {
    return everyCharIn(token.slice(1), LOWER_BASE32_CHARS);
  }

  if (token.length >= 32 && token.length <= 44) {
    return everyCharIn(token, LOWER_BASE58_CHARS);
  }

  return false;
}

/** True when any token in the message looks like a wallet address. */
export function messageContainsWalletAddress(tokens: readonly string[]): boolean {
  return tokens.some((token) => looksLikeWalletAddress(token));
}
