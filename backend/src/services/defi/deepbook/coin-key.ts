import { getDeepBookEnv } from "../../config/deepbook.js";

/** True when the value is a DeepBook tradable coin symbol (SUI, USDC, …). */
export function isDeepBookCoinKey(value: string): boolean {
  const upper = value.trim().toUpperCase();
  return upper.length > 0 && upper in getDeepBookEnv().coins;
}

/** True when the value matches a configured DeepBook pool key (e.g. SUI_USDC). */
export function isDeepBookPoolKey(value: string): boolean {
  const upper = value.trim().toUpperCase();
  return upper.length > 0 && upper in getDeepBookEnv().pools;
}

/**
 * Agents/LLMs sometimes pass pool_key as coin_key. Never auto-map pool → base coin
 * (WAL_USDC → WAL) — callers must prefer explicit user intent instead.
 */
export function formatPoolKeyCoinKeyError(coinKey: string): string {
  return (
    `params.coin_key "${coinKey}" looks like a DeepBook pool key, not a coin. ` +
    `Use a single coin symbol (e.g. SUI or USDC), not a pair like SUI_USDC.`
  );
}
