import { Transaction } from "@mysten/sui/transactions";
import { getDeepBookEnv } from "../../config/deepbook.js";
import { AppError } from "../../errors/app-error.js";
import { getSuiClient } from "../../infrastructure/sui/client.js";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../wallet/sui-signing.service.js";
import { getAssetDecimals } from "./asset-scalars.js";
import { getDeepBookPoolInfo } from "./deepbook-pools.service.js";
import {
  getDeepBookClient,
  getSuiDeepBookClient,
  type SuiDeepBookExtendedClient,
} from "./providers/sui-deepbook.provider.js";
import type { SwapQuote, SwapSide } from "./types.js";
import type { TxResult } from "../chains/types.js";

const DEFAULT_SLIPPAGE_BPS = 100;
const SWAP_ACTIONS = new Set(["swap", "deepbook_swap"]);

export type DeepBookSwapParams = {
  pool_key: string;
  amount: number;
  side: SwapSide;
  pay_with_deep: boolean;
  slippage_bps: number;
  min_out_display?: number;
};

export type DeepBookSwapQuoteResult = SwapQuote & {
  side: SwapSide;
  pay_with_deep: boolean;
  slippage_bps: number;
  min_out_display: number;
  indexer_last_price: number | null;
  source: "sdk+indexer";
};

export type DeepBookSwapTxResult = TxResult & {
  pool_key: string;
  side: SwapSide;
  input_coin: string;
  output_coin: string;
  in_amount_display: number;
  out_amount_display: number;
  fee_deep: number | null;
  price: number | null;
  pay_with_deep: boolean;
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

function assertPoolKey(poolKey: string): PoolCoins {
  const normalized = poolKey.trim().toUpperCase();
  const { pools } = getDeepBookEnv();
  const pool = pools[normalized as keyof typeof pools];
  if (!pool) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Unknown DeepBook pool "${poolKey}". Supported pools include ${Object.keys(pools).slice(0, 8).join(", ")}.`,
    );
  }
  return { pool_key: normalized, base_coin: pool.baseCoin, quote_coin: pool.quoteCoin };
}

function parsePositiveAmount(params: Record<string, unknown>): number {
  if (typeof params.amount === "number" && params.amount > 0) return params.amount;
  if (typeof params.amount_display === "number" && params.amount_display > 0) {
    return params.amount_display;
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "params.amount or params.amount_display must be a positive number",
  );
}

function parseSlippageBps(params: Record<string, unknown>): number {
  if (typeof params.slippage_bps === "number" && params.slippage_bps >= 0) {
    return Math.min(params.slippage_bps, 5_000);
  }
  return DEFAULT_SLIPPAGE_BPS;
}

export function parseDeepBookSwapParams(params: Record<string, unknown>): DeepBookSwapParams {
  const { defaultPool } = getDeepBookEnv();
  const poolKey =
    typeof params.pool_key === "string" && params.pool_key.length > 0
      ? params.pool_key
      : defaultPool;

  const side = params.side;
  if (side !== "buy" && side !== "sell") {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      'params.side must be "buy" (spend quote for base) or "sell" (spend base for quote)',
    );
  }

  const parsed: DeepBookSwapParams = {
    pool_key: assertPoolKey(poolKey).pool_key,
    amount: parsePositiveAmount(params),
    side,
    pay_with_deep: params.pay_with_deep !== false,
    slippage_bps: parseSlippageBps(params),
  };

  if (typeof params.min_out_display === "number" && params.min_out_display > 0) {
    parsed.min_out_display = params.min_out_display;
  }

  return parsed;
}

export function isDeepBookSwapAction(action: string): boolean {
  return SWAP_ACTIONS.has(action);
}

function swapCoins(side: SwapSide, pool: PoolCoins): { input: string; output: string } {
  return side === "sell"
    ? { input: pool.base_coin, output: pool.quote_coin }
    : { input: pool.quote_coin, output: pool.base_coin };
}

function displayToAtomic(amountDisplay: number, coinKey: string): string {
  const decimals = getAssetDecimals(coinKey);
  const factor = 10 ** decimals;
  const atomic = BigInt(Math.floor(amountDisplay * factor));
  if (atomic <= 0n) {
    throw new AppError(400, "VALIDATION_ERROR", "Amount is too small after conversion");
  }
  return atomic.toString();
}

function applySlippage(outDisplay: number, slippageBps: number): number {
  const factor = Math.max(0, 10_000 - slippageBps) / 10_000;
  return Number((outDisplay * factor).toFixed(9));
}

function computePrice(
  side: SwapSide,
  inAmount: number,
  outAmount: number,
): number | null {
  if (inAmount <= 0 || outAmount <= 0) return null;
  return side === "sell" ? outAmount / inAmount : inAmount / outAmount;
}

/** Estimate swap notional in SUI for approval thresholds. */
export function estimateSwapNotionalSui(
  inputCoin: string,
  amountDisplay: number,
  suiPerInput: number | null,
): number {
  const coin = inputCoin.toUpperCase();
  if (coin === "SUI") return amountDisplay;
  if (suiPerInput && suiPerInput > 0) {
    return amountDisplay / suiPerInput;
  }
  return amountDisplay;
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

async function buildAndExecuteSwapTransaction(
  privyUserId: string,
  build: (tx: Transaction, client: SuiDeepBookExtendedClient, address: string) => void,
): Promise<TxResult> {
  const agentWallet = await resolveSuiAgentWallet(privyUserId);
  const privyWallet = await fetchPrivyWallet(agentWallet.privy_wallet_id);

  const tx = new Transaction();
  tx.setSender(agentWallet.address);

  const extended = getSuiDeepBookClient({ address: agentWallet.address });
  build(tx, extended, agentWallet.address);

  const transactionBytes = await tx.build({ client: getSuiClient() });
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

async function fetchSdkQuote(
  walletAddress: string,
  parsed: DeepBookSwapParams,
  pool: PoolCoins,
): Promise<{
  outDisplay: number;
  feeDeep: number;
  price: number | null;
}> {
  const client = getDeepBookClient({ address: walletAddress });

  if (parsed.side === "sell") {
    const quote = parsed.pay_with_deep
      ? await client.getQuoteQuantityOut(parsed.pool_key, parsed.amount)
      : await client.getQuoteQuantityOutInputFee(parsed.pool_key, parsed.amount);

    return {
      outDisplay: quote.quoteOut,
      feeDeep: quote.deepRequired,
      price: computePrice("sell", parsed.amount, quote.quoteOut),
    };
  }

  const quote = parsed.pay_with_deep
    ? await client.getBaseQuantityOut(parsed.pool_key, parsed.amount)
    : await client.getBaseQuantityOutInputFee(parsed.pool_key, parsed.amount);

  return {
    outDisplay: quote.baseOut,
    feeDeep: quote.deepRequired,
    price: computePrice("buy", parsed.amount, quote.baseOut),
  };
}

async function validateSwapSize(
  privyUserId: string,
  parsed: DeepBookSwapParams,
  pool: PoolCoins,
): Promise<void> {
  try {
    const info = await getDeepBookPoolInfo(parsed.pool_key, privyUserId);
    if (!info.on_chain) return;

    const { min_size, lot_size } = info.on_chain;
    const baseAmount = parsed.side === "sell" ? parsed.amount : undefined;

    if (baseAmount !== undefined && baseAmount < min_size) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Swap amount ${baseAmount} ${pool.base_coin} is below pool min_size ${min_size}`,
      );
    }

    if (baseAmount !== undefined && lot_size > 0) {
      const remainder = baseAmount % lot_size;
      if (remainder > 1e-9) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Swap amount must be a multiple of lot_size ${lot_size} ${pool.base_coin}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
  }
}

export async function getDeepBookSwapQuote(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookSwapQuoteResult> {
  const parsed = parseDeepBookSwapParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  const wallet = await resolveSuiAgentWallet(privyUserId);

  await validateSwapSize(privyUserId, parsed, pool);

  const { input, output } = swapCoins(parsed.side, pool);
  const sdkQuote = await fetchSdkQuote(wallet.address, parsed, pool);

  let indexerPrice: number | null = null;
  try {
    const info = await getDeepBookPoolInfo(parsed.pool_key, privyUserId);
    indexerPrice = info.ticker?.last_price ?? null;
  } catch {
    indexerPrice = null;
  }

  const minOut =
    parsed.min_out_display ?? applySlippage(sdkQuote.outDisplay, parsed.slippage_bps);

  return {
    provider_id: "sui-deepbook",
    pool_key: parsed.pool_key,
    input_coin: input,
    output_coin: output,
    input_amount_atomic: displayToAtomic(parsed.amount, input),
    output_amount_atomic: displayToAtomic(minOut, output),
    input_amount_display: parsed.amount,
    output_amount_display: sdkQuote.outDisplay,
    price: sdkQuote.price ?? indexerPrice,
    fee_deep: parsed.pay_with_deep ? sdkQuote.feeDeep : null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    side: parsed.side,
    pay_with_deep: parsed.pay_with_deep,
    slippage_bps: parsed.slippage_bps,
    min_out_display: minOut,
    indexer_last_price: indexerPrice,
    source: "sdk+indexer",
  };
}

function addSwapToTransaction(
  tx: Transaction,
  client: SuiDeepBookExtendedClient,
  address: string,
  parsed: DeepBookSwapParams,
  minOut: number,
  feeDeep: number,
): void {
  const isSell = parsed.side === "sell";
  const deepAmount = parsed.pay_with_deep ? feeDeep : 0;

  const [baseResult, quoteResult, deepResult] = tx.add(
    client.deepbook.swapExactQuantity({
      poolKey: parsed.pool_key,
      amount: parsed.amount,
      deepAmount,
      minOut,
      isBaseToCoin: isSell,
    }),
  );

  if (isSell) {
    tx.transferObjects([quoteResult], address);
    tx.transferObjects([baseResult, deepResult], address);
  } else {
    tx.transferObjects([baseResult], address);
    tx.transferObjects([quoteResult, deepResult], address);
  }
}

export async function executeDeepBookSwap(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookSwapTxResult> {
  const parsed = parseDeepBookSwapParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  const { input, output } = swapCoins(parsed.side, pool);

  const quote = await getDeepBookSwapQuote(privyUserId, params);
  const minOut = quote.min_out_display;

  const result = await buildAndExecuteSwapTransaction(privyUserId, (tx, client, address) => {
    addSwapToTransaction(
      tx,
      client,
      address,
      parsed,
      minOut,
      quote.fee_deep ?? 0,
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    side: parsed.side,
    input_coin: input,
    output_coin: output,
    in_amount_display: parsed.amount,
    out_amount_display: quote.output_amount_display,
    fee_deep: quote.fee_deep,
    price: quote.price,
    pay_with_deep: parsed.pay_with_deep,
  };
}

/** Dry-run: build swap PTB bytes without signing (for integration tests). */
export async function buildDeepBookSwapTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; quote: DeepBookSwapQuoteResult }> {
  const parsed = parseDeepBookSwapParams(params);
  const quote = await getDeepBookSwapQuote(privyUserId, params);
  const wallet = await resolveSuiAgentWallet(privyUserId);

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const extended = getSuiDeepBookClient({ address: wallet.address });
  addSwapToTransaction(
    tx,
    extended,
    wallet.address,
    parsed,
    quote.min_out_display,
    quote.fee_deep ?? 0,
  );

  const bytes = await tx.build({ client: getSuiClient() });
  return { bytes, quote };
}

/** Test hooks */
export function resetDeepBookSwapServiceForTests(): void {
  executeSignedTx = executeSignedSuiTransaction;
  signTxBytes = signSuiTransactionBytes;
  fetchPrivyWallet = async (privyWalletId: string) => {
    const wallet = await getPrivyClient().wallets().get(privyWalletId);
    if (!wallet.public_key) {
      throw new AppError(502, "WALLET_METADATA_MISSING", "Missing public key");
    }
    return wallet;
  };
}

export function setExecuteSignedTxForSwapTests(
  fn: typeof executeSignedSuiTransaction,
): void {
  executeSignedTx = fn;
}
