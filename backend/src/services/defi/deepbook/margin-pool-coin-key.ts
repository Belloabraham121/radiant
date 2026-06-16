import { AppError } from "../../../errors/app-error.js";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { isDeepBookPoolKey } from "./coin-key.js";

const COIN_ALIASES: Record<string, string[]> = {
  USDC: ["DBUSDC"],
  DBUSDC: ["USDC"],
};

/** Map user/agent coin_type to a DeepBook margin pool coin key (e.g. USDC, SUI). */
export function resolveMarginPoolCoinKey(raw: unknown): string {
  const normalized = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!normalized) {
    throw new AppError(400, "VALIDATION_ERROR", "coin_type is required for margin pool actions.");
  }

  if (isDeepBookPoolKey(normalized)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `coin_type "${normalized}" is a trading pool key, not a margin pool asset. Use a coin symbol such as USDC or SUI.`,
    );
  }

  const marginPools = getDeepBookEnv().marginPools;
  const available = Object.keys(marginPools);

  if (available.includes(normalized)) {
    return normalized;
  }

  for (const alias of COIN_ALIASES[normalized] ?? []) {
    if (available.includes(alias)) {
      return alias;
    }
  }

  throw new AppError(
    400,
    "INVALID_MARGIN_POOL_COIN",
    `No margin pool for coin "${normalized}". Available margin pool assets: ${available.join(", ")}`,
  );
}
