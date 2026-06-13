import { Transaction } from "@mysten/sui/transactions";
import { getDeepBookEnv } from "../../config/deepbook.js";
import { AppError } from "../../errors/app-error.js";
import { getSuiClient } from "../../infrastructure/sui/client.js";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { assertFlashLoansEnabled } from "../agent/agent-permissions.service.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../wallet/sui-signing.service.js";
import { getDeepBookPoolInfo } from "./deepbook-pools.service.js";
import { isMultipleOfStep } from "./order-constraints.js";
import { normalizePoolKey } from "./pool-key.js";
import {
  getSuiDeepBookClient,
  type SuiDeepBookExtendedClient,
} from "./providers/sui-deepbook.provider.js";
import type { TxResult } from "../chains/types.js";

export const DEEPBOOK_FLASH_LOAN_ACTION = "deepbook_flash_loan" as const;

export type FlashLoanAsset = "base" | "quote";
export type FlashLoanStrategy = "round_trip";

export type DeepBookFlashLoanParams = {
  pool_key: string;
  borrow_amount: number;
  asset: FlashLoanAsset;
  coin_key: string;
  strategy: FlashLoanStrategy;
};

export type DeepBookFlashLoanTxResult = TxResult & {
  pool_key: string;
  borrow_amount: number;
  coin_key: string;
  asset: FlashLoanAsset;
  strategy: FlashLoanStrategy;
};

type PoolCoins = {
  pool_key: string;
  base_coin: string;
  quote_coin: string;
};

let executeSignedTx = executeSignedSuiTransaction;
let signTxBytes = signSuiTransactionBytes;
let fetchPrivyWallet = async (privyWalletId: string) => {
  const wallet = await getPrivyClient().wallets().get(privyWalletId);
  if (!wallet.public_key) {
    throw new AppError(
      502,
      "WALLET_METADATA_MISSING",
      "Privy Sui wallet is missing a public key — cannot serialize signatures",
    );
  }
  return wallet;
};

export function isDeepBookFlashLoanAction(action: string): boolean {
  return action === DEEPBOOK_FLASH_LOAN_ACTION;
}

function assertPoolKey(poolKey: string): PoolCoins {
  const normalized = normalizePoolKey(poolKey);
  const { pools } = getDeepBookEnv();
  const pool = pools[normalized as keyof typeof pools];
  if (!pool) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Unknown DeepBook pool "${poolKey}". Call query_chain deepbook_pools for the full list. ` +
        `Known pools include ${Object.keys(pools).join(", ")}.`,
    );
  }
  return { pool_key: normalized, base_coin: pool.baseCoin, quote_coin: pool.quoteCoin };
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

function resolveFlashLoanStrategy(params: Record<string, unknown>): FlashLoanStrategy {
  const strategy = params.strategy;
  if (strategy === undefined || strategy === "round_trip") {
    return "round_trip";
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    'params.strategy must be "round_trip" (advanced borrow/repay strategies are not supported yet)',
  );
}

export function parseDeepBookFlashLoanParams(
  params: Record<string, unknown>,
): DeepBookFlashLoanParams {
  const poolKey =
    typeof params.pool_key === "string" && params.pool_key.length > 0
      ? params.pool_key
      : getDeepBookEnv().defaultPool;
  const pool = assertPoolKey(poolKey);
  const asset = resolveFlashLoanAsset(params, pool);
  const borrow_amount = parseBorrowAmount(params);
  const strategy = resolveFlashLoanStrategy(params);
  const coin_key = asset === "base" ? pool.base_coin : pool.quote_coin;

  return {
    pool_key: pool.pool_key,
    borrow_amount,
    asset,
    coin_key,
    strategy,
  };
}

async function validateFlashLoanSize(
  privyUserId: string,
  parsed: DeepBookFlashLoanParams,
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

async function resolveSuiAgentWallet(privyUserId: string) {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  if (!wallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "No Sui agent wallet registered.");
  }
  if (!wallet.signer_added) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Session signer has not been added to the agent wallet",
    );
  }
  return wallet;
}

function mapBuildError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/insufficient\s*balance|insufficientcoinbalance|not enough/i.test(message)) {
    throw new AppError(400, "INSUFFICIENT_BALANCE", message);
  }
  if (err instanceof AppError) {
    throw err;
  }
  throw err;
}

function addFlashLoanRoundTripToTransaction(
  tx: Transaction,
  client: SuiDeepBookExtendedClient,
  address: string,
  parsed: DeepBookFlashLoanParams,
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

async function buildAndExecuteFlashLoanTransaction(
  privyUserId: string,
  parsed: DeepBookFlashLoanParams,
): Promise<TxResult> {
  const agentWallet = await resolveSuiAgentWallet(privyUserId);
  const privyWallet = await fetchPrivyWallet(agentWallet.privy_wallet_id);

  const tx = new Transaction();
  tx.setSender(agentWallet.address);

  const extended = getSuiDeepBookClient({ address: agentWallet.address });
  addFlashLoanRoundTripToTransaction(tx, extended, agentWallet.address, parsed);

  let transactionBytes: Uint8Array;
  try {
    transactionBytes = await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }

  const serializedSignature = await signTxBytes({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: agentWallet.address,
    publicKeyBase58: privyWallet.public_key!,
    transactionBytes,
  });

  const result = await executeSignedTx({
    transactionBytes,
    serializedSignature,
    suiAddress: agentWallet.address,
  });

  return {
    chain_id: "sui",
    digest: result.digest,
    address: result.sui_address,
    effects_status: result.effects_status,
  };
}

export async function buildDeepBookFlashLoanTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; parsed: DeepBookFlashLoanParams }> {
  await assertFlashLoansEnabled(privyUserId);
  const parsed = parseDeepBookFlashLoanParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateFlashLoanSize(privyUserId, parsed, pool);

  const wallet = await resolveSuiAgentWallet(privyUserId);
  const tx = new Transaction();
  tx.setSender(wallet.address);

  const extended = getSuiDeepBookClient({ address: wallet.address });
  addFlashLoanRoundTripToTransaction(tx, extended, wallet.address, parsed);

  let bytes: Uint8Array;
  try {
    bytes = await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }

  return { bytes, parsed };
}

export async function preflightDeepBookFlashLoan(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  await buildDeepBookFlashLoanTransactionBytes(privyUserId, params);
}

export async function executeDeepBookFlashLoan(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookFlashLoanTxResult> {
  await assertFlashLoansEnabled(privyUserId);
  const parsed = parseDeepBookFlashLoanParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateFlashLoanSize(privyUserId, parsed, pool);

  const result = await buildAndExecuteFlashLoanTransaction(privyUserId, parsed);

  return {
    ...result,
    pool_key: parsed.pool_key,
    borrow_amount: parsed.borrow_amount,
    coin_key: parsed.coin_key,
    asset: parsed.asset,
    strategy: parsed.strategy,
  };
}

/** Test hooks */
export function resetDeepBookFlashLoanServiceForTests(): void {
  executeSignedTx = executeSignedSuiTransaction;
  signTxBytes = signSuiTransactionBytes;
  fetchPrivyWallet = async (privyWalletId: string) => {
    const wallet = await getPrivyClient().wallets().get(privyWalletId);
    if (!wallet.public_key) {
      throw new AppError(
        502,
        "WALLET_METADATA_MISSING",
        "Privy Sui wallet is missing a public key — cannot serialize signatures",
      );
    }
    return wallet;
  };
}
