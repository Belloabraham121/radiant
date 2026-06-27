import { resolveTokenSymbol } from "../../../config/supported-tokens.js";
import { AppError } from "../../../errors/app-error.js";
import { getSoroswapTokens } from "./soroswap-token-catalog.service.js";

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function resolveSupportedStellarToken(symbol: string) {
  const resolved = resolveTokenSymbol("stellar", symbol);
  if (resolved.match !== "exact") {
    throw new AppError(400, "VALIDATION_ERROR", `Unable to resolve Stellar asset for "${symbol}".`, {
      symbol,
      chain_id: "stellar",
    });
  }
  return resolved.token;
}

/**
 * Map a Radiant Stellar symbol to a Soroswap API asset id (classic, Soroban, or native).
 * Prefers Soroban USDC contract from `STELLAR_USDC_SOROBAN_CONTRACT`; XLM uses catalog or `native`.
 */
export async function resolveSoroswapAsset(symbol: string): Promise<string> {
  const normalized = normalizeSymbol(symbol);
  const supported = resolveSupportedStellarToken(normalized);
  const tokens = await getSoroswapTokens();
  const catalogEntry = tokens.find((entry) => normalizeSymbol(entry.symbol) === normalized);

  if (normalized === "USDC") {
    if (supported.address) {
      return supported.address;
    }
    if (catalogEntry?.address) {
      return catalogEntry.address;
    }
    if (supported.stellar_asset_code && supported.stellar_issuer) {
      return `${supported.stellar_asset_code}:${supported.stellar_issuer}`;
    }
  }

  if (normalized === "XLM") {
    if (catalogEntry?.address) {
      return catalogEntry.address;
    }
    return "native";
  }

  if (catalogEntry?.address) {
    return catalogEntry.address;
  }

  if (supported.address) {
    return supported.address;
  }

  throw new AppError(400, "VALIDATION_ERROR", `Unable to resolve Stellar asset for "${normalized}".`, {
    symbol: normalized,
    chain_id: "stellar",
  });
}
