/** Uppercase symbol → CoinGecko coin id */
export const COINGECKO_SYMBOL_TO_ID: Record<string, string> = {
  SUI: "sui",
  USDC: "usd-coin",
  USDT: "tether",
  DEEP: "deep",
  WAL: "walrus-2",
  ETH: "ethereum",
  SOL: "solana",
  POL: "polygon-ecosystem-token",
};

export function resolveCoingeckoId(symbol: string): string | null {
  return COINGECKO_SYMBOL_TO_ID[symbol.toUpperCase()] ?? null;
}
