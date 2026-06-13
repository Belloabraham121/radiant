import type { TransactionObjectArgument } from "@mysten/sui/transactions";
import { Transaction } from "@mysten/sui/transactions";
import { optional } from "../../config/optional-env.js";
import { AppError } from "../../errors/app-error.js";
import { assertFlashLoansEnabled } from "../agent/agent-permissions.service.js";
import { getAssetDecimals } from "./asset-scalars.js";
import { getDeepBookPoolInfo } from "./deepbook-pools.service.js";
import { isMultipleOfStep } from "./order-constraints.js";
import type { SuiDeepBookExtendedClient } from "./providers/sui-deepbook.provider.js";
import {
  MAX_FLASH_LOAN_STEPS,
  resolvePoolCoins,
  validateFlashLoanStructure,
  type DeepBookFlashLoanBundleParams,
  type FlashLoanBundleQuoteResult,
  type FlashLoanStep,
  type FlashLoanStepQuote,
  type PoolCoins,
} from "./deepbook-flash-loan.types.js";

function displayToAtomic(amountDisplay: number, coinKey: string): bigint {
  const decimals = getAssetDecimals(coinKey);
  const factor = 10 ** decimals;
  return BigInt(Math.floor(amountDisplay * factor));
}

async function validateBorrowSize(
  privyUserId: string,
  parsed: DeepBookFlashLoanBundleParams,
  pool: PoolCoins,
): Promise<void> {
  if (parsed.asset !== "base") {
    return;
  }

  try {
    const info = await getDeepBookPoolInfo(parsed.pool_key, privyUserId);
    if (!info.on_chain) {
      return;
    }

    const { min_size, lot_size } = info.on_chain;
    if (parsed.borrow_amount < min_size) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Flash loan amount ${parsed.borrow_amount} ${pool.base_coin} is below pool min_size ${min_size}`,
      );
    }

    if (lot_size > 0 && !isMultipleOfStep(parsed.borrow_amount, lot_size)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Flash loan amount must be a multiple of lot_size ${lot_size} ${pool.base_coin}`,
      );
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
  }
}

async function validateStepSize(
  privyUserId: string,
  step: { pool_key: string; side: "buy" | "sell"; amount: number },
  pool: PoolCoins,
): Promise<void> {
  if (step.side !== "sell") {
    return;
  }

  try {
    const info = await getDeepBookPoolInfo(step.pool_key, privyUserId);
    if (!info.on_chain) {
      return;
    }

    const { min_size, lot_size } = info.on_chain;
    if (step.amount < min_size) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Step sell amount ${step.amount} ${pool.base_coin} is below pool min_size ${min_size}`,
      );
    }

    if (lot_size > 0 && !isMultipleOfStep(step.amount, lot_size)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Step sell amount must be a multiple of lot_size ${lot_size} ${pool.base_coin}`,
      );
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
  }
}

function assertMaxBorrowNotional(parsed: DeepBookFlashLoanBundleParams): void {
  const maxRaw = optional("AGENT_FLASH_LOAN_MAX_BORROW_SUI", "");
  if (!maxRaw) {
    return;
  }

  const max = Number(maxRaw);
  if (!Number.isFinite(max) || max <= 0) {
    return;
  }

  if (parsed.coin_key === "SUI" && parsed.borrow_amount > max) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Flash loan borrow amount exceeds safety cap of ${max} SUI`,
    );
  }
}

export async function validateFlashLoanBundle(
  privyUserId: string,
  parsed: DeepBookFlashLoanBundleParams,
  options?: { quoteMode?: boolean },
): Promise<void> {
  await assertFlashLoansEnabled(privyUserId);

  const borrowPool = resolvePoolCoins(parsed.pool_key);
  await validateBorrowSize(privyUserId, parsed, borrowPool);
  assertMaxBorrowNotional(parsed);

  if (parsed.strategy === "swap_chain_repay") {
    if (!parsed.steps?.length || parsed.steps.length > MAX_FLASH_LOAN_STEPS) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `swap_chain_repay requires 1–${MAX_FLASH_LOAN_STEPS} steps`,
      );
    }

    for (const step of parsed.steps) {
      const stepPool = resolvePoolCoins(step.pool_key);
      await validateStepSize(privyUserId, step, stepPool);
    }

    validateFlashLoanStructure(parsed, {
      allowIncompleteRoute: options?.quoteMode === true,
    });
  }
}

function addRoundTripToTransaction(
  tx: Transaction,
  client: SuiDeepBookExtendedClient,
  address: string,
  parsed: DeepBookFlashLoanBundleParams,
): void {
  const flashLoans = client.deepbook.flashLoans;

  if (parsed.asset === "base") {
    const [borrowedCoin, flashLoan] = tx.add(
      flashLoans.borrowBaseAsset(parsed.pool_key, parsed.borrow_amount),
    );
    const remainder = tx.add(
      flashLoans.returnBaseAsset(
        parsed.pool_key,
        parsed.borrow_amount,
        borrowedCoin,
        flashLoan,
      ),
    );
    tx.transferObjects([remainder], address);
    return;
  }

  const [borrowedCoin, flashLoan] = tx.add(
    flashLoans.borrowQuoteAsset(parsed.pool_key, parsed.borrow_amount),
  );
  const remainder = tx.add(
    flashLoans.returnQuoteAsset(
      parsed.pool_key,
      parsed.borrow_amount,
      borrowedCoin,
      flashLoan,
    ),
  );
  tx.transferObjects([remainder], address);
}

function addSwapStepToTransaction(
  tx: Transaction,
  client: SuiDeepBookExtendedClient,
  address: string,
  step: FlashLoanStep,
  quote: FlashLoanStepQuote,
  coinIn: TransactionObjectArgument,
): TransactionObjectArgument {
  const isSell = step.side === "sell";
  const minOut = step.min_out_display ?? quote.min_out;
  const deepAmount = step.pay_with_deep ? quote.fee_deep : 0;

  const swapParams = {
    poolKey: step.pool_key,
    amount: step.amount,
    deepAmount,
    minOut,
    isBaseToCoin: isSell,
    ...(isSell ? { baseCoin: coinIn } : { quoteCoin: coinIn }),
  };

  const [baseResult, quoteResult, deepResult] = tx.add(
    client.deepbook.deepBook.swapExactQuantity(swapParams),
  );

  if (isSell) {
    tx.transferObjects([baseResult, deepResult], address);
    return quoteResult;
  }

  tx.transferObjects([quoteResult, deepResult], address);
  return baseResult;
}

function addSwapChainRepayToTransaction(
  tx: Transaction,
  client: SuiDeepBookExtendedClient,
  address: string,
  parsed: DeepBookFlashLoanBundleParams,
  quote: FlashLoanBundleQuoteResult,
): void {
  const flashLoans = client.deepbook.flashLoans;
  const steps = parsed.steps ?? [];
  const stepQuotes = quote.steps;

  let coinIn: TransactionObjectArgument;
  let flashLoan: TransactionObjectArgument;

  if (parsed.asset === "base") {
    const borrowed = tx.add(
      flashLoans.borrowBaseAsset(parsed.pool_key, parsed.borrow_amount),
    );
    coinIn = borrowed[0];
    flashLoan = borrowed[1];
  } else {
    const borrowed = tx.add(
      flashLoans.borrowQuoteAsset(parsed.pool_key, parsed.borrow_amount),
    );
    coinIn = borrowed[0];
    flashLoan = borrowed[1];
  }

  for (let i = 0; i < steps.length; i += 1) {
    coinIn = addSwapStepToTransaction(
      tx,
      client,
      address,
      steps[i],
      stepQuotes[i],
      coinIn,
    );
  }

  const repayAtomic = displayToAtomic(parsed.borrow_amount, parsed.coin_key);
  const [repayCoin, surplusCoin] = tx.splitCoins(coinIn, [tx.pure.u64(repayAtomic)]);

  const loanRemain =
    parsed.asset === "base"
      ? tx.add(
          flashLoans.returnBaseAsset(
            parsed.pool_key,
            parsed.borrow_amount,
            repayCoin,
            flashLoan,
          ),
        )
      : tx.add(
          flashLoans.returnQuoteAsset(
            parsed.pool_key,
            parsed.borrow_amount,
            repayCoin,
            flashLoan,
          ),
        );

  tx.transferObjects([surplusCoin, loanRemain], address);
}

export function buildFlashLoanPtb(
  tx: Transaction,
  client: SuiDeepBookExtendedClient,
  address: string,
  parsed: DeepBookFlashLoanBundleParams,
  quote: FlashLoanBundleQuoteResult,
): void {
  if (parsed.strategy === "round_trip") {
    addRoundTripToTransaction(tx, client, address, parsed);
    return;
  }

  if (quote.repay_source === "swap_output" && !quote.repay_feasible) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Flash loan repay is not feasible at quoted outputs — adjust steps or amounts",
    );
  }

  addSwapChainRepayToTransaction(tx, client, address, parsed, quote);
}
