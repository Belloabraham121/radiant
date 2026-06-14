import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import type {
  DeepBookFlashLoanBundleParams,
  FlashLoanStep,
} from "./deepbook-flash-loan.types.js";
import { resolvePoolCoins, stepCoins } from "./deepbook-flash-loan.types.js";

/** First-hop swap candidates that spend the borrowed coin across configured pools. */
export function enumerateFirstSwapStepCandidates(
  parsed: Pick<
    DeepBookFlashLoanBundleParams,
    "pool_key" | "coin_key" | "borrow_amount" | "asset"
  >,
): FlashLoanStep[] {
  const { pools, defaultPool } = getDeepBookEnv();
  const candidates: FlashLoanStep[] = [];
  const seen = new Set<string>();

  const pushCandidate = (poolKey: string, side: "buy" | "sell") => {
    const pool = resolvePoolCoins(poolKey);
    if (parsed.asset === "base" && pool.pool_key === parsed.pool_key) {
      return;
    }
    const coins = stepCoins(side, pool);
    if (coins.input !== parsed.coin_key) {
      return;
    }
    const key = `${pool.pool_key}:${side}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      pool_key: pool.pool_key,
      side,
      amount: parsed.borrow_amount,
    });
  };

  const orderedKeys = [
    parsed.pool_key,
    defaultPool,
    ...Object.keys(pools).filter(
      (key) => key !== parsed.pool_key && key !== defaultPool,
    ),
  ];

  for (const rawKey of orderedKeys) {
    if (!(rawKey in pools)) {
      continue;
    }
    const pool = resolvePoolCoins(rawKey);
    if (pool.quote_coin === parsed.coin_key) {
      pushCandidate(pool.pool_key, "buy");
    }
    if (pool.base_coin === parsed.coin_key) {
      pushCandidate(pool.pool_key, "sell");
    }
  }

  return candidates;
}

export type SwapChainRouteScore = {
  steps: FlashLoanStep[];
  repay_feasible: boolean;
  estimated_surplus: number | null;
};

export function rankSwapChainRouteScores(
  scores: SwapChainRouteScore[],
): SwapChainRouteScore | null {
  if (scores.length === 0) {
    return null;
  }

  const feasible = scores.filter((score) => score.repay_feasible);
  const pool = feasible.length > 0 ? feasible : scores;

  return pool.reduce((best, current) => {
    const bestSurplus = best.estimated_surplus ?? Number.NEGATIVE_INFINITY;
    const currentSurplus =
      current.estimated_surplus ?? Number.NEGATIVE_INFINITY;
    return currentSurplus > bestSurplus ? current : best;
  });
}

export function pickBestSwapChainRoute(
  scores: SwapChainRouteScore[],
): FlashLoanStep[] {
  const best = rankSwapChainRouteScores(scores);
  if (!best) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "No viable swap_chain_repay route could be found for this borrow amount. " +
        "Try a smaller borrow_amount or specify explicit steps after comparing pool quotes.",
    );
  }
  return best.steps;
}
