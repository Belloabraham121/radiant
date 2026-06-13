import { getDeepBookEnv } from "../../../config/deepbook.js";

/** Normalize user/agent pool names to DeepBook indexer keys (e.g. DEEP/USDC → DEEP_USDC). */
export function normalizePoolKey(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/\//g, "_")
    .replace(/-/g, "_");
}

/** Find a DeepBook pool key for a coin pair (e.g. DEEP + SUI → DEEP_SUI). */
export function resolvePoolKeyForCoinPair(fromCoin: string, toCoin: string): string | null {
  const from = fromCoin.trim().toUpperCase();
  const to = toCoin.trim().toUpperCase();
  const { pools } = getDeepBookEnv();

  for (const [poolKey, pool] of Object.entries(pools)) {
    const base = pool.baseCoin.toUpperCase();
    const quote = pool.quoteCoin.toUpperCase();
    if ((base === from && quote === to) || (base === to && quote === from)) {
      return poolKey;
    }
  }

  return null;
}
