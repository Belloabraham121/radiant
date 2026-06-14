import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { normalizePoolKey, resolvePoolKeyAlias } from "./pool-key.js";
import type { SwapSide } from "./types.js";

export const FLASH_LOAN_STRATEGIES = ["round_trip", "swap_chain_repay"] as const;
export type FlashLoanStrategy = (typeof FLASH_LOAN_STRATEGIES)[number];

export type FlashLoanAsset = "base" | "quote";
export type FlashLoanRepaySource = "swap_output" | "wallet" | "merged";

export type FlashLoanStep = {
  pool_key: string;
  side: SwapSide;
  amount: number;
  pay_with_deep?: boolean;
  min_out_display?: number;
};

export type DeepBookFlashLoanBundleParams = {
  pool_key: string;
  borrow_amount: number;
  asset: FlashLoanAsset;
  coin_key: string;
  strategy: FlashLoanStrategy;
  steps?: FlashLoanStep[];
  slippage_bps: number;
  repay_source: FlashLoanRepaySource;
  estimated_surplus?: number;
};

export type FlashLoanStepQuote = {
  pool_key: string;
  side: SwapSide;
  in_amount: number;
  out_est: number;
  min_out: number;
  fee_deep: number;
  input_coin: string;
  output_coin: string;
};

export type FlashLoanBundleQuoteResult = {
  strategy: FlashLoanStrategy;
  pool_key: string;
  borrow_amount: number;
  asset: FlashLoanAsset;
  coin_key: string;
  repay_asset: string;
  repay_amount: number;
  repay_feasible: boolean;
  repay_source: FlashLoanRepaySource;
  estimated_surplus: number | null;
  requires_manual_approval: boolean;
  steps: FlashLoanStepQuote[];
  warnings: string[];
};

export const MAX_FLASH_LOAN_STEPS = 2;
export const DEFAULT_FLASH_LOAN_SLIPPAGE_BPS = 100;

export type PoolCoins = {
  pool_key: string;
  base_coin: string;
  quote_coin: string;
};

export function resolvePoolCoins(poolKey: string): PoolCoins {
  const { pools } = getDeepBookEnv();
  const resolved =
    resolvePoolKeyAlias(poolKey, pools) ?? normalizePoolKey(poolKey);
  const pool = pools[resolved as keyof typeof pools];
  if (!pool) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Unknown DeepBook pool "${poolKey}". Call query_chain deepbook_pools for the full list. ` +
        `Known pools include ${Object.keys(pools).join(", ")}.`,
    );
  }
  return { pool_key: resolved, base_coin: pool.baseCoin, quote_coin: pool.quoteCoin };
}

export function stepCoins(side: SwapSide, pool: PoolCoins): { input: string; output: string } {
  return side === "sell"
    ? { input: pool.base_coin, output: pool.quote_coin }
    : { input: pool.quote_coin, output: pool.base_coin };
}

function parseBorrowAmount(params: Record<string, unknown>): number {
  if (typeof params.borrow_amount === "number" && params.borrow_amount > 0) {
    return params.borrow_amount;
  }
  if (typeof params.amount === "number" && params.amount > 0) {
    return params.amount;
  }
  if (typeof params.amount_display === "number" && params.amount_display > 0) {
    return params.amount_display;
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "params.borrow_amount (or amount) must be a positive number",
  );
}

function resolveFlashLoanAsset(
  params: Record<string, unknown>,
  pool: PoolCoins,
): FlashLoanAsset {
  const rawAsset = params.asset;
  if (rawAsset === "base" || rawAsset === "quote") {
    return rawAsset;
  }

  const coinKey =
    typeof params.coin_key === "string" ? params.coin_key.trim().toUpperCase() : null;
  if (coinKey === pool.base_coin) {
    return "base";
  }
  if (coinKey === pool.quote_coin) {
    return "quote";
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `params.asset must be "base" or "quote", or params.coin_key must match the pool (${pool.base_coin} or ${pool.quote_coin})`,
  );
}

function parseSlippageBps(params: Record<string, unknown>): number {
  if (typeof params.slippage_bps === "number" && params.slippage_bps >= 0) {
    return Math.min(params.slippage_bps, 5_000);
  }
  return DEFAULT_FLASH_LOAN_SLIPPAGE_BPS;
}

function parseRepaySource(
  params: Record<string, unknown>,
  strategy: FlashLoanStrategy,
): FlashLoanRepaySource {
  const raw = params.repay_source ?? params.repay_from;
  if (raw === "swap_output" || raw === "wallet" || raw === "merged") {
    return raw;
  }
  if (strategy === "swap_chain_repay") {
    return "swap_output";
  }
  return "swap_output";
}

function parseFlashLoanStep(raw: unknown, index: number): FlashLoanStep {
  if (typeof raw !== "object" || raw === null) {
    throw new AppError(400, "VALIDATION_ERROR", `steps[${index}] must be an object`);
  }

  const step = raw as Record<string, unknown>;
  const poolKey =
    typeof step.pool_key === "string" && step.pool_key.length > 0
      ? step.pool_key
      : null;
  if (!poolKey) {
    throw new AppError(400, "VALIDATION_ERROR", `steps[${index}].pool_key is required`);
  }

  const side = step.side;
  if (side !== "buy" && side !== "sell") {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `steps[${index}].side must be "buy" or "sell"`,
    );
  }

  const amount =
    typeof step.amount === "number" && step.amount > 0
      ? step.amount
      : typeof step.amount_display === "number" && step.amount_display > 0
        ? step.amount_display
        : null;
  if (amount === null) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `steps[${index}].amount must be a positive number`,
    );
  }

  const parsed: FlashLoanStep = {
    pool_key: normalizePoolKey(poolKey),
    side,
    amount,
  };

  if (step.pay_with_deep === true) {
    parsed.pay_with_deep = true;
  }
  if (typeof step.min_out_display === "number" && step.min_out_display > 0) {
    parsed.min_out_display = step.min_out_display;
  }

  return parsed;
}

function parseSteps(params: Record<string, unknown>, strategy: FlashLoanStrategy): FlashLoanStep[] {
  if (strategy === "round_trip") {
    if (params.steps !== undefined) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        'params.steps is not allowed for strategy "round_trip"',
      );
    }
    return [];
  }

  if (!Array.isArray(params.steps) || params.steps.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      'params.steps is required for strategy "swap_chain_repay" (1–2 steps)',
    );
  }

  if (params.steps.length > MAX_FLASH_LOAN_STEPS) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Flash loan bundles support at most ${MAX_FLASH_LOAN_STEPS} swap steps`,
    );
  }

  return params.steps.map((step, index) => parseFlashLoanStep(step, index));
}

function resolveFlashLoanStrategy(params: Record<string, unknown>): FlashLoanStrategy {
  const strategy = params.strategy;
  if (strategy === undefined || strategy === "round_trip") {
    return "round_trip";
  }
  if (strategy === "swap_chain_repay" || strategy === "swap_repay") {
    return "swap_chain_repay";
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `params.strategy must be one of: ${FLASH_LOAN_STRATEGIES.join(", ")}`,
  );
}

export function parseDeepBookFlashLoanParams(
  params: Record<string, unknown>,
): DeepBookFlashLoanBundleParams {
  const poolKey =
    typeof params.pool_key === "string" && params.pool_key.length > 0
      ? params.pool_key
      : getDeepBookEnv().defaultPool;
  const pool = resolvePoolCoins(poolKey);
  const strategy = resolveFlashLoanStrategy(params);
  const asset = resolveFlashLoanAsset(params, pool);
  const borrow_amount = parseBorrowAmount(params);
  const coin_key = asset === "base" ? pool.base_coin : pool.quote_coin;
  const steps = parseSteps(params, strategy);
  const slippage_bps = parseSlippageBps(params);
  const repay_source = parseRepaySource(params, strategy);

  const parsed: DeepBookFlashLoanBundleParams = {
    pool_key: pool.pool_key,
    borrow_amount,
    asset,
    coin_key,
    strategy,
    slippage_bps,
    repay_source,
    steps: steps.length > 0 ? steps : undefined,
  };

  if (typeof params.estimated_surplus === "number") {
    parsed.estimated_surplus = params.estimated_surplus;
  }

  validateFlashLoanStructure(parsed, {
    allowIncompleteRoute: (parsed.steps?.length ?? 0) < 2,
  });
  return parsed;
}

function assertSamePoolBorrowTradeGuard(parsed: DeepBookFlashLoanBundleParams): void {
  if (parsed.asset !== "base" || !parsed.steps?.length) {
    return;
  }

  for (const step of parsed.steps) {
    if (step.pool_key === parsed.pool_key) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Borrowing base and trading on the same pool in one flash loan can fail on DeepBook — use a different pool for swap steps",
      );
    }
  }
}

function assertStepAmountChain(parsed: DeepBookFlashLoanBundleParams): void {
  const steps = parsed.steps;
  if (!steps?.length) {
    return;
  }

  const firstCoins = stepCoins(steps[0].side, resolvePoolCoins(steps[0].pool_key));
  if (firstCoins.input !== parsed.coin_key) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `First swap step must spend borrowed ${parsed.coin_key}, but step spends ${firstCoins.input}`,
    );
  }

  const repayEpsilon = 1e-6;
  if (Math.abs(steps[0].amount - parsed.borrow_amount) > repayEpsilon) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `First swap step amount (${steps[0].amount}) must equal borrow_amount (${parsed.borrow_amount})`,
    );
  }

  for (let i = 1; i < steps.length; i += 1) {
    const prev = stepCoins(steps[i - 1].side, resolvePoolCoins(steps[i - 1].pool_key));
    const next = stepCoins(steps[i].side, resolvePoolCoins(steps[i].pool_key));
    if (prev.output !== next.input) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Step ${i + 1} must spend ${prev.output} from step ${i}, but spends ${next.input}`,
      );
    }
  }
}

function assertRepayAssetClosure(parsed: DeepBookFlashLoanBundleParams): void {
  if (parsed.strategy !== "swap_chain_repay" || parsed.repay_source !== "swap_output") {
    return;
  }

  const steps = parsed.steps;
  if (!steps?.length) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "swap_chain_repay requires at least one swap step",
    );
  }

  const lastStep = steps[steps.length - 1];
  const lastCoins = stepCoins(lastStep.side, resolvePoolCoins(lastStep.pool_key));
  if (lastCoins.output !== parsed.coin_key) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Final swap must output ${parsed.coin_key} to repay the loan, but outputs ${lastCoins.output}`,
    );
  }
}

export function validateFlashLoanStructure(
  parsed: DeepBookFlashLoanBundleParams,
  options?: { allowIncompleteRoute?: boolean },
): void {
  if (parsed.strategy !== "swap_chain_repay") {
    return;
  }

  assertSamePoolBorrowTradeGuard(parsed);
  assertStepAmountChain(parsed);

  if (options?.allowIncompleteRoute && (parsed.steps?.length ?? 0) < 2) {
    return;
  }

  assertRepayAssetClosure(parsed);
}
