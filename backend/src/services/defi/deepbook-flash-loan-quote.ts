import { AppError } from "../../errors/app-error.js";
import { getDeepBookSwapQuote } from "./deepbook-swap.service.js";
import { validateFlashLoanBundle } from "./deepbook-flash-loan-bundle.js";
import {
  parseDeepBookFlashLoanParams,
  resolvePoolCoins,
  stepCoins,
  type DeepBookFlashLoanBundleParams,
  type FlashLoanBundleQuoteResult,
  type FlashLoanStep,
  type FlashLoanStepQuote,
} from "./deepbook-flash-loan.types.js";

const REPAY_EPSILON = 1e-6;

export function computeBundleRepayFeasibility(
  lastMinOut: number,
  borrowAmount: number,
  repaySource: DeepBookFlashLoanBundleParams["repay_source"],
): boolean {
  if (repaySource !== "swap_output") {
    return true;
  }
  return lastMinOut + REPAY_EPSILON >= borrowAmount;
}

function applySlippage(outDisplay: number, slippageBps: number): number {
  const factor = Math.max(0, 10_000 - slippageBps) / 10_000;
  return Number((outDisplay * factor).toFixed(9));
}

async function quoteSwapStep(
  privyUserId: string,
  step: NonNullable<DeepBookFlashLoanBundleParams["steps"]>[number],
  slippageBps: number,
): Promise<FlashLoanStepQuote> {
  const pool = resolvePoolCoins(step.pool_key);
  const { input, output } = stepCoins(step.side, pool);

  const swapQuote = await getDeepBookSwapQuote(privyUserId, {
    pool_key: step.pool_key,
    amount: step.amount,
    side: step.side,
    pay_with_deep: step.pay_with_deep === true,
    slippage_bps: slippageBps,
    ...(step.min_out_display !== undefined
      ? { min_out_display: step.min_out_display }
      : {}),
  });

  const minOut = step.min_out_display ?? applySlippage(swapQuote.output_amount_display, slippageBps);

  return {
    pool_key: step.pool_key,
    side: step.side,
    in_amount: step.amount,
    out_est: swapQuote.output_amount_display,
    min_out: minOut,
    fee_deep: swapQuote.fee_deep ?? 0,
    input_coin: input,
    output_coin: output,
  };
}

function buildRoundTripQuote(parsed: DeepBookFlashLoanBundleParams): FlashLoanBundleQuoteResult {
  return {
    strategy: "round_trip",
    pool_key: parsed.pool_key,
    borrow_amount: parsed.borrow_amount,
    asset: parsed.asset,
    coin_key: parsed.coin_key,
    repay_asset: parsed.coin_key,
    repay_amount: parsed.borrow_amount,
    repay_feasible: true,
    repay_source: parsed.repay_source,
    estimated_surplus: 0,
    requires_manual_approval: parsed.repay_source !== "swap_output",
    steps: [],
    warnings: [],
  };
}

function buildWarnings(
  parsed: DeepBookFlashLoanBundleParams,
  stepQuotes: FlashLoanStepQuote[],
  repayFeasible: boolean,
  estimatedSurplus: number | null,
): string[] {
  const warnings: string[] = [];

  if (parsed.asset === "base" && parsed.steps?.some((s) => s.pool_key === parsed.pool_key)) {
    warnings.push("Borrowing base and trading on the same pool may fail on-chain.");
  }

  if (!repayFeasible) {
    warnings.push("Quoted outputs may not cover the borrow amount for atomic repay.");
  }

  if (estimatedSurplus !== null && estimatedSurplus < REPAY_EPSILON) {
    warnings.push("Estimated surplus is very low — small price moves can revert the transaction.");
  }

  if (stepQuotes.some((q) => q.fee_deep > 0 && !parsed.steps?.find((s) => s.pool_key === q.pool_key)?.pay_with_deep)) {
    warnings.push("Some steps may require DEEP from your wallet for fees when pay_with_deep is false.");
  }

  if (parsed.slippage_bps > 200) {
    warnings.push(`Slippage tolerance is high (${parsed.slippage_bps} bps).`);
  }

  return warnings;
}

async function buildSwapChainQuote(
  privyUserId: string,
  parsed: DeepBookFlashLoanBundleParams,
): Promise<FlashLoanBundleQuoteResult> {
  const steps: FlashLoanStep[] = [...(parsed.steps ?? [])];
  const stepQuotes: FlashLoanStepQuote[] = [];

  let runningCoin = parsed.coin_key;
  for (let i = 0; i < steps.length; i += 1) {
    let step = steps[i];
    const pool = resolvePoolCoins(step.pool_key);
    const coins = stepCoins(step.side, pool);

    if (coins.input !== runningCoin) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Step ${i + 1} must spend ${runningCoin}, but spends ${coins.input}`,
      );
    }

    if (i === 0 && Math.abs(step.amount - parsed.borrow_amount) > REPAY_EPSILON) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `First step amount (${step.amount}) must equal borrow_amount (${parsed.borrow_amount})`,
      );
    }

    if (i > 0 && stepQuotes[i - 1]) {
      const expectedIn = stepQuotes[i - 1].out_est;
      if (Math.abs(step.amount - expectedIn) > REPAY_EPSILON) {
        step = { ...step, amount: expectedIn };
        steps[i] = step;
      }
    }

    const quoted = await quoteSwapStep(privyUserId, step, parsed.slippage_bps);
    stepQuotes.push(quoted);
    runningCoin = quoted.output_coin;
  }

  if (runningCoin !== parsed.coin_key && stepQuotes.length > 0) {
    const lastQuote = stepQuotes[stepQuotes.length - 1];
    const returnPool = resolvePoolCoins(steps[0].pool_key);
    const returnSide = returnPool.base_coin === lastQuote.output_coin ? "sell" : "buy";
    const returnStep: FlashLoanStep = {
      pool_key: steps[0].pool_key,
      side: returnSide,
      amount: lastQuote.out_est,
    };
    steps.push(returnStep);
    const returnQuote = await quoteSwapStep(privyUserId, returnStep, parsed.slippage_bps);
    stepQuotes.push(returnQuote);
    runningCoin = returnQuote.output_coin;
  }

  const lastQuote = stepQuotes[stepQuotes.length - 1];
  const repayFeasible = computeBundleRepayFeasibility(
    lastQuote.min_out,
    parsed.borrow_amount,
    parsed.repay_source,
  );

  const estimatedSurplus =
    parsed.repay_source === "swap_output" && lastQuote
      ? Number((lastQuote.out_est - parsed.borrow_amount).toFixed(9))
      : null;

  const requiresManualApproval =
    parsed.repay_source === "wallet" || parsed.repay_source === "merged";

  return {
    strategy: "swap_chain_repay",
    pool_key: parsed.pool_key,
    borrow_amount: parsed.borrow_amount,
    asset: parsed.asset,
    coin_key: parsed.coin_key,
    repay_asset: parsed.coin_key,
    repay_amount: parsed.borrow_amount,
    repay_feasible: repayFeasible,
    repay_source: parsed.repay_source,
    estimated_surplus: estimatedSurplus,
    requires_manual_approval: requiresManualApproval,
    steps: stepQuotes,
    warnings: buildWarnings(parsed, stepQuotes, repayFeasible, estimatedSurplus),
  };
}

export async function getFlashLoanBundleQuote(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<FlashLoanBundleQuoteResult> {
  const parsed = parseDeepBookFlashLoanParams(params);
  await validateFlashLoanBundle(privyUserId, parsed, { quoteMode: true });

  if (parsed.strategy === "round_trip") {
    return buildRoundTripQuote(parsed);
  }

  return buildSwapChainQuote(privyUserId, parsed);
}
