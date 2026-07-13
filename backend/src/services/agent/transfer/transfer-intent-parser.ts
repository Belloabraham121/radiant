import { getEnabledEvmChainIds } from "../../../config/evm.js";
import { getSupportedChains } from "../../../config/supported-tokens.js";
import { resolveEvmChainIdFromLabel } from "../../defi/lifi/lifi-endpoint-params.js";
import {
  parseDisplayAmountToAtomic,
  resolveEvmTransferToken,
} from "../../wallet/evm-transaction.service.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import { parsePositiveNumber, tokenizeMessage } from "../swap/text-tokenize.js";

const TRANSFER_VERBS = new Set(["send", "transfer", "pay"]);

const HEX_CHARS = new Set("0123456789abcdef");
const TRAILING_PUNCTUATION = new Set([".", "!", "?", ";", ":", ")", "'", '"']);

export type ParsedTransferIntent = {
  input: ExecuteTransactionInput;
  amount: number;
  symbol: string;
  recipient: string;
  evmChainId?: number;
};

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

/** "evm" (0x + 40 hex) or "sui" (0x + 64 hex); null for anything else. */
export function classifyRecipientAddress(rawToken: string): "evm" | "sui" | null {
  const token = stripTrailingPunctuation(rawToken.toLowerCase());
  if (!token.startsWith("0x")) {
    return null;
  }
  const body = token.slice(2);
  if (!everyCharIn(body, HEX_CHARS)) {
    return null;
  }
  if (body.length === 40) {
    return "evm";
  }
  if (body.length === 64) {
    return "sui";
  }
  return null;
}

/**
 * Recover the original-cased address from the raw message. `tokenizeMessage`
 * lowercases tokens, but recipients must keep their casing.
 */
function splitOnWhitespacePreservingCase(message: string): string[] {
  const words: string[] = [];
  let current = "";
  for (const char of message) {
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      if (current.length > 0) {
        words.push(current);
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
    words.push(current);
  }
  return words;
}

function findOriginalCaseToken(message: string, lowercased: string): string | null {
  for (const rawWord of splitOnWhitespacePreservingCase(message)) {
    const cleaned = stripTrailingPunctuation(rawWord);
    if (cleaned.toLowerCase() === lowercased) {
      return cleaned;
    }
  }
  return null;
}

function transferSymbolsForEcosystem(kind: "evm" | "sui"): Set<string> {
  const symbols = new Set<string>();
  for (const entry of getSupportedChains()) {
    if (kind === "evm" && entry.chain_id === "ethereum") {
      for (const symbol of entry.allowed_symbols) {
        symbols.add(symbol.toUpperCase());
      }
    }
    if (kind === "sui" && entry.chain_id === "sui") {
      symbols.add("SUI");
    }
  }
  return symbols;
}

/**
 * Deterministic transfer intent: verb + amount + allowlisted token + wallet
 * address. Returns null on any ambiguity so richer paths (LLM agent) handle it.
 * No regex, mirroring the other intent parsers.
 */
export function parseSingleTransferIntent(message: string): ParsedTransferIntent | null {
  const tokens = tokenizeMessage(message);

  if (!tokens.some((token) => TRANSFER_VERBS.has(token))) {
    return null;
  }

  let addressIndex = -1;
  let addressKind: "evm" | "sui" | null = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const kind = classifyRecipientAddress(tokens[index]);
    if (kind) {
      addressIndex = index;
      addressKind = kind;
      break;
    }
  }
  if (addressIndex < 0 || !addressKind) {
    return null;
  }

  const recipient = findOriginalCaseToken(
    message,
    stripTrailingPunctuation(tokens[addressIndex]),
  );
  if (!recipient) {
    return null;
  }

  let amount: number | undefined;
  let symbol: string | undefined;
  let symbolIndex = -1;

  let symbols: Set<string>;
  try {
    symbols = transferSymbolsForEcosystem(addressKind);
  } catch {
    return null;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (index === addressIndex) {
      continue;
    }
    const token = tokens[index];

    if (amount === undefined) {
      // Bare token amounts only — "$5" / "5 usd" needs a price conversion, so
      // it falls through to the LLM agent.
      const numeric = parsePositiveNumber(token);
      const isPlainNumber =
        numeric !== undefined && everyCharIn(token, new Set("0123456789."));
      if (isPlainNumber) {
        amount = numeric;
        continue;
      }
    }

    if (symbol === undefined && symbols.has(token.toUpperCase())) {
      symbol = token.toUpperCase();
      symbolIndex = index;
    }
  }

  if (amount === undefined || symbol === undefined) {
    return null;
  }

  if (tokens.includes("usd") || tokens.includes("dollars") || message.includes("$")) {
    return null;
  }

  if (addressKind === "sui") {
    if (symbol !== "SUI") {
      return null;
    }
    const amountMist = parseDisplayAmountToAtomic(amount, 9);
    if (amountMist === null) {
      return null;
    }
    return {
      input: {
        chain_id: "sui",
        action: "transfer_sui",
        params: { recipient, amount_mist: amountMist.toString() },
      },
      amount,
      symbol,
      recipient,
    };
  }

  // EVM: resolve the network from an explicit chain label, or from the token
  // when it only exists on one enabled network.
  let evmChainId: number | undefined;
  const enabledEvmIds = getEnabledEvmChainIds();
  for (let index = 0; index < tokens.length; index += 1) {
    if (index === addressIndex || index === symbolIndex) {
      continue;
    }
    const resolved = resolveEvmChainIdFromLabel(tokens[index]);
    if (resolved !== undefined && enabledEvmIds.includes(resolved)) {
      evmChainId = resolved;
      break;
    }
  }

  if (evmChainId === undefined && enabledEvmIds.length === 1) {
    evmChainId = enabledEvmIds[0];
  }

  try {
    const resolved = resolveEvmTransferToken({ token: symbol }, evmChainId);
    evmChainId = resolved.evm_chain_id ?? evmChainId;
    if (evmChainId === undefined) {
      return null;
    }

    const action = resolved.token.kind === "native" ? "transfer_eth" : "transfer_token";
    const params: Record<string, unknown> =
      action === "transfer_eth"
        ? { recipient, amount_display: amount, evm_chain_id: evmChainId }
        : { recipient, token: resolved.symbol, amount_display: amount, evm_chain_id: evmChainId };

    return {
      input: { chain_id: "ethereum", action, params },
      amount,
      symbol: resolved.symbol,
      recipient,
      evmChainId,
    };
  } catch {
    // Ambiguous / disabled token — let the LLM agent ask the right question.
    return null;
  }
}
