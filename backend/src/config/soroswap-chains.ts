import { getSupportedChains, resolveTokenSymbol } from "./supported-tokens.js";
import { AppError } from "../errors/app-error.js";

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** Stellar v1 allowlist — delegated to `V1_ALLOWED_SYMBOLS.stellar` via supported-tokens. */
export function getSoroswapAllowedSymbols(): readonly string[] {
  const stellar = getSupportedChains().find((entry) => entry.chain_id === "stellar");
  return stellar?.allowed_symbols ?? [];
}

export function isSoroswapAllowedSymbol(symbol: string): boolean {
  const normalized = normalizeSymbol(symbol);
  return getSoroswapAllowedSymbols().includes(normalized);
}

/** Gate catalog entries by canonical Stellar asset identity (code + issuer), with XLM native exception. */
export function isSoroswapAllowedToken(token: {
  symbol: string;
  issuer?: string;
  type?: string;
  address?: string;
}): boolean {
  const symbol = normalizeSymbol(token.symbol);
  if (!isSoroswapAllowedSymbol(symbol)) {
    return false;
  }

  if (symbol === "XLM") {
    return true;
  }

  const resolved = resolveTokenSymbol("stellar", symbol);
  if (resolved.match !== "exact" || resolved.token.kind !== "stellar_classic") {
    return false;
  }

  const expectedIssuer = resolved.token.stellar_issuer?.trim();
  const tokenIssuer = token.issuer?.trim();
  if (!expectedIssuer || !tokenIssuer) {
    return false;
  }

  return tokenIssuer === expectedIssuer;
}

/** Both symbols must be on the Stellar v1 allowlist and must differ. */
export function assertSoroswapTokenPair(fromSymbol: string, toSymbol: string): void {
  const from = normalizeSymbol(fromSymbol);
  const to = normalizeSymbol(toSymbol);

  if (from === to) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Swap input and output tokens must differ.",
      { from_symbol: from, to_symbol: to },
    );
  }

  if (!isSoroswapAllowedSymbol(from)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Token "${from}" is not supported for Stellar swaps.`,
      { symbol: from, chain_id: "stellar" },
    );
  }

  if (!isSoroswapAllowedSymbol(to)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Token "${to}" is not supported for Stellar swaps.`,
      { symbol: to, chain_id: "stellar" },
    );
  }
}
