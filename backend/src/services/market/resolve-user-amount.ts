import { getAssetDecimals } from "../defi/deepbook/asset-scalars.js";
import { AppError } from "../../errors/app-error.js";
import { parsePositiveNumber } from "../agent/swap/text-tokenize.js";
import { resolveSymbolUsdPrices } from "./valuation.service.js";

export type AmountUnit = "token" | "usd";

export type ParsedUserAmount = {
  value: number;
  unit: AmountUnit;
};

const USD_WORDS = new Set(["usd", "usdc", "usdt", "dollar", "dollars", "buck", "bucks"]);
const CENT_WORDS = new Set(["cent", "cents"]);

/** Tokens whose bare sub-1 amounts are often meant as USD (e.g. 0.6 → $0.60). */
const AMBIGUOUS_EXPENSIVE_SYMBOLS = new Set([
  "ETH",
  "WETH",
  "BTC",
  "WBTC",
  "SOL",
  "BETH",
  "XBTC",
  "LZWBTC",
]);

function stripLeadingDollar(text: string): { rest: string; hadDollar: boolean } {
  if (text.startsWith("$")) {
    return { rest: text.slice(1).trim(), hadDollar: true };
  }
  return { rest: text, hadDollar: false };
}

function parseNumericPortion(text: string): number | undefined {
  const { rest } = stripLeadingDollar(text.trim());
  return parsePositiveNumber(rest);
}

function endsWithWord(text: string, word: string): boolean {
  const suffix = ` ${word}`;
  return text.length > suffix.length && text.endsWith(suffix);
}

function stripTrailingWords(text: string, words: readonly string[]): string | null {
  for (const word of words) {
    if (endsWithWord(text, word)) {
      return text.slice(0, -(word.length + 1)).trim();
    }
  }
  return null;
}

/** Parse free-form user amount text (e.g. "$0.6", "10 usd", "0.5 eth", "60 cents"). */
export function parseUserAmount(input: string): ParsedUserAmount | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const centsStripped = stripTrailingWords(trimmed, [...CENT_WORDS]);
  if (centsStripped !== null) {
    const cents = parseNumericPortion(centsStripped);
    if (cents !== undefined) {
      return { value: cents / 100, unit: "usd" };
    }
  }

  for (const word of USD_WORDS) {
    const stripped = stripTrailingWords(trimmed, [word]);
    if (stripped !== null) {
      const val = parseNumericPortion(stripped);
      if (val !== undefined) {
        return { value: val, unit: "usd" };
      }
    }
  }

  const { rest, hadDollar } = stripLeadingDollar(trimmed);
  if (hadDollar) {
    const val = parsePositiveNumber(rest);
    if (val !== undefined) {
      return { value: val, unit: "usd" };
    }
  }

  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  let value: number | undefined;
  let unit: AmountUnit = "token";

  for (const part of parts) {
    if (USD_WORDS.has(part)) {
      unit = "usd";
      continue;
    }
    if (part.startsWith("$")) {
      const val = parsePositiveNumber(part.slice(1));
      if (val !== undefined) {
        value = val;
        unit = "usd";
      }
      continue;
    }
    const num = parsePositiveNumber(part);
    if (num !== undefined && value === undefined) {
      value = num;
    }
  }

  if (value === undefined) {
    return null;
  }

  return { value, unit };
}

/** Parse a single tokenized message segment (e.g. "$10", "10usd"). */
export function parseAmountFromToken(token: string): ParsedUserAmount | null {
  const lower = token.toLowerCase();

  if (lower.startsWith("$")) {
    const val = parsePositiveNumber(lower.slice(1));
    if (val !== undefined) {
      return { value: val, unit: "usd" };
    }
  }

  for (const word of USD_WORDS) {
    if (lower.endsWith(word) && lower.length > word.length) {
      const numPart = lower.slice(0, -word.length);
      const val = parsePositiveNumber(numPart);
      if (val !== undefined) {
        return { value: val, unit: "usd" };
      }
    }
  }

  const val = parsePositiveNumber(lower);
  if (val !== undefined) {
    return { value: val, unit: "token" };
  }

  return null;
}

/** Scan token list for amount + optional trailing USD word (e.g. ["10", "usd"]). */
export function parseAmountFromTokens(
  tokens: readonly string[],
  startIndex: number,
): { parsed: ParsedUserAmount; consumed: number } | null {
  const single = parseAmountFromToken(tokens[startIndex] ?? "");
  if (single) {
    return { parsed: single, consumed: 1 };
  }

  const next = tokens[startIndex + 1]?.toLowerCase();
  if (next && USD_WORDS.has(next)) {
    const num = parseAmountFromToken(tokens[startIndex] ?? "");
    if (num && num.unit === "token") {
      return { parsed: { value: num.value, unit: "usd" }, consumed: 2 };
    }
  }

  return null;
}

export function roundAmountForSymbol(value: number, symbol: string): number {
  const decimals = getAssetDecimals(symbol);
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

export type ResolveUserAmountInput = {
  value: number;
  unit: AmountUnit;
  symbol: string;
  amountSide?: "pay" | "receive";
  /** Output token symbol when resolving receive-side USD amounts. */
  outputSymbol?: string;
};

export type ResolvedTokenAmount = {
  amountDisplay: number;
  symbol: string;
  resolvedFromUsd?: number;
};

export async function resolveUserAmountToToken(
  input: ResolveUserAmountInput,
): Promise<ResolvedTokenAmount> {
  const { value, unit, amountSide } = input;
  const pricingSymbol =
    unit === "usd" && amountSide === "receive" && input.outputSymbol
      ? input.outputSymbol
      : input.symbol;

  if (unit === "token") {
    return {
      amountDisplay: roundAmountForSymbol(value, pricingSymbol),
      symbol: pricingSymbol,
    };
  }

  const prices = await resolveSymbolUsdPrices([pricingSymbol]);
  const row = prices.get(pricingSymbol.toUpperCase());
  const usdPrice = row?.usdPrice ?? null;

  if (usdPrice === null || usdPrice <= 0) {
    throw new AppError(
      400,
      "PRICE_UNAVAILABLE",
      `I couldn't get a USD price for ${pricingSymbol}, so I can't convert $${value} into a token amount. Try entering the amount in ${pricingSymbol} instead.`,
    );
  }

  const tokenAmount = roundAmountForSymbol(value / usdPrice, pricingSymbol);
  if (tokenAmount <= 0) {
    throw new AppError(
      400,
      "AMOUNT_TOO_SMALL",
      `$${value} is too small to buy any ${pricingSymbol} at the current price (~$${usdPrice}).`,
    );
  }

  return {
    amountDisplay: tokenAmount,
    symbol: pricingSymbol,
    resolvedFromUsd: value,
  };
}

/** Whether a bare token amount may mean USD instead (e.g. 0.6 ETH vs $0.60). */
export function isAmountUnitAmbiguous(
  value: number,
  unit: AmountUnit,
  symbol: string | undefined,
): boolean {
  if (unit !== "token" || !symbol) {
    return false;
  }
  if (value >= 1) {
    return false;
  }
  return AMBIGUOUS_EXPENSIVE_SYMBOLS.has(symbol.toUpperCase());
}

export function formatAmbiguousAmountQuestion(
  value: number,
  symbol: string,
  approximateUsdPerToken?: number | null,
): string {
  const usdLabel = `$${value.toFixed(2)}`;
  if (approximateUsdPerToken && approximateUsdPerToken > 0) {
    const tokenUsd = (value * approximateUsdPerToken).toFixed(0);
    return `Did you mean ${usdLabel} worth of ${symbol}, or ${value} ${symbol} (~$${tokenUsd})?`;
  }
  return `Did you mean ${usdLabel} worth of ${symbol}, or ${value} ${symbol}?`;
}
