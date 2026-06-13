/** Decimal places per DeepBook indexer asset symbol. */
const ASSET_DECIMALS: Record<string, number> = {
  ALKIMI: 9,
  AUSD: 6,
  BETH: 8,
  DEEP: 6,
  DRF: 6,
  IKA: 9,
  LZWBTC: 8,
  USDC: 6,
  NS: 6,
  SEND: 6,
  SUI: 9,
  TYPUS: 9,
  SUIUSDE: 6,
  USDSUI: 6,
  WAL: 9,
  WUSDC: 6,
  WUSDT: 6,
  USDT: 6,
  XBTC: 8,
};

const STABLECOIN_SYMBOLS = new Set([
  "USDC",
  "WUSDC",
  "USDT",
  "WUSDT",
  "AUSD",
  "USDSUI",
  "SUIUSDE",
  "EURC",
  "USDB",
]);

export function getAssetDecimals(symbol: string): number {
  return ASSET_DECIMALS[symbol.toUpperCase()] ?? 9;
}

export function atomicToDisplay(amountAtomic: bigint, decimals: number): number {
  return Number(amountAtomic) / 10 ** decimals;
}

export function isStablecoinSymbol(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
}
