import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";

/** Normalize user/agent pool names to DeepBook indexer keys (e.g. DEEP/USDC → DEEP_USDC). */
export function normalizePoolKey(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/\//g, "_")
    .replace(/-/g, "_");
}

/** User-facing coin symbols that map to DeepBook pool coin names on some networks. */
export function coinsMatchForPool(requested: string, poolCoin: string): boolean {
  const from = requested.trim().toUpperCase();
  const to = poolCoin.trim().toUpperCase();
  if (from === to) return true;

  const stableGroups = [
    ["USDC", "DBUSDC", "WUSDC"],
    ["USDT", "DBUSDT", "WUSDT"],
  ];
  for (const group of stableGroups) {
    if (group.includes(from) && group.includes(to)) return true;
  }
  return false;
}

/** Map legacy or shorthand pool keys to keys that exist in the current env. */
export function resolvePoolKeyAlias(
  poolKey: string,
  pools: Record<string, { baseCoin: string; quoteCoin: string }>,
): string | null {
  const normalized = normalizePoolKey(poolKey);
  if (pools[normalized]) return normalized;

  const aliases: Record<string, string> = {
    SUI_USDC: "SUI_DBUSDC",
    DEEP_USDC: "DEEP_DBUSDC",
  };
  const mapped = aliases[normalized];
  if (mapped && pools[mapped]) return mapped;

  return null;
}

/** Resolve to a pool key that exists in the current DeepBook env, or throw. */
export function assertResolvablePoolKey(poolKey: string): string {
  const { pools } = getDeepBookEnv();
  const resolved = resolvePoolKeyAlias(poolKey, pools) ?? normalizePoolKey(poolKey);
  if (pools[resolved as keyof typeof pools]) {
    return resolved;
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `Unknown DeepBook pool "${poolKey}". Call query_chain deepbook_pools for the full list. ` +
      `Known pools include ${Object.keys(pools).join(", ")}.`,
  );
}

/** Find a DeepBook pool key for a coin pair (e.g. SUI + USDC → SUI_DBUSDC on testnet). */
export function resolvePoolKeyForCoinPair(fromCoin: string, toCoin: string): string | null {
  const from = fromCoin.trim().toUpperCase();
  const to = toCoin.trim().toUpperCase();
  const { pools } = getDeepBookEnv();

  for (const [poolKey, pool] of Object.entries(pools)) {
    const base = pool.baseCoin.toUpperCase();
    const quote = pool.quoteCoin.toUpperCase();
    if (
      (coinsMatchForPool(from, base) && coinsMatchForPool(to, quote)) ||
      (coinsMatchForPool(from, quote) && coinsMatchForPool(to, base))
    ) {
      return poolKey;
    }
  }

  return null;
}

export function resolveSwapPoolKey(input: {
  fromCoin: string;
  toCoin: string;
  explicitPoolKey?: string | null;
}): string {
  if (input.explicitPoolKey) {
    return assertResolvablePoolKey(input.explicitPoolKey);
  }

  const pairPool = resolvePoolKeyForCoinPair(input.fromCoin, input.toCoin);
  if (pairPool) {
    return pairPool;
  }

  return assertResolvablePoolKey(getDeepBookEnv().defaultPool);
}

export function inferSwapSideForPool(
  fromCoin: string,
  toCoin: string,
  poolKey: string,
): "buy" | "sell" {
  const { pools } = getDeepBookEnv();
  const pool = pools[poolKey as keyof typeof pools];
  if (pool) {
    const from = fromCoin.trim().toUpperCase();
    if (coinsMatchForPool(from, pool.baseCoin)) return "sell";
    if (coinsMatchForPool(from, pool.quoteCoin)) return "buy";
  }
  if (fromCoin.trim().toUpperCase() === "SUI") return "sell";
  if (toCoin.trim().toUpperCase() === "SUI") return "buy";
  return "sell";
}

/** Default pool for SUI↔USDC-style swaps in the active DeepBook env. */
export function defaultSuiStablePoolKey(): string {
  return resolvePoolKeyForCoinPair("SUI", "USDC") ?? getDeepBookEnv().defaultPool;
}
