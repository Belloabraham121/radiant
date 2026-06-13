import { Transaction } from "@mysten/sui/transactions";
import { getSuiClient } from "../../infrastructure/sui/client.js";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { AppError } from "../../errors/app-error.js";
import { assertFlashLoansEnabled } from "../agent/agent-permissions.service.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../wallet/sui-signing.service.js";
import { buildFlashLoanPtb, validateFlashLoanBundle } from "./deepbook-flash-loan-bundle.js";
import { getFlashLoanBundleQuote } from "./deepbook-flash-loan-quote.js";
import {
  parseDeepBookFlashLoanParams,
  type DeepBookFlashLoanBundleParams,
  type FlashLoanAsset,
  type FlashLoanBundleQuoteResult,
  type FlashLoanStrategy,
} from "./deepbook-flash-loan.types.js";
import { getSuiDeepBookClient } from "./providers/sui-deepbook.provider.js";
import type { TxResult } from "../chains/types.js";

export const DEEPBOOK_FLASH_LOAN_ACTION = "deepbook_flash_loan" as const;

export type DeepBookFlashLoanParams = DeepBookFlashLoanBundleParams;
export type { FlashLoanAsset, FlashLoanStrategy };

export type DeepBookFlashLoanTxResult = TxResult & {
  pool_key: string;
  borrow_amount: number;
  coin_key: string;
  asset: FlashLoanAsset;
  strategy: FlashLoanStrategy;
  steps_count: number;
  estimated_surplus: number | null;
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

export { parseDeepBookFlashLoanParams };

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

async function buildFlashLoanTransaction(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<{
  bytes: Uint8Array;
  parsed: DeepBookFlashLoanBundleParams;
  quote: FlashLoanBundleQuoteResult;
}> {
  await assertFlashLoansEnabled(privyUserId);
  const parsed = parseDeepBookFlashLoanParams(params);
  await validateFlashLoanBundle(privyUserId, parsed);
  const quote = await getFlashLoanBundleQuote(privyUserId, params);

  const wallet = await resolveSuiAgentWallet(privyUserId);
  const tx = new Transaction();
  tx.setSender(wallet.address);

  const extended = getSuiDeepBookClient({ address: wallet.address });
  buildFlashLoanPtb(tx, extended, wallet.address, parsed, quote);

  let bytes: Uint8Array;
  try {
    bytes = await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }

  return { bytes, parsed, quote };
}

export async function buildDeepBookFlashLoanTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; parsed: DeepBookFlashLoanBundleParams }> {
  const { bytes, parsed } = await buildFlashLoanTransaction(privyUserId, params);
  return { bytes, parsed };
}

export async function preflightDeepBookFlashLoan(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  await buildFlashLoanTransaction(privyUserId, params);
}

export async function executeDeepBookFlashLoan(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookFlashLoanTxResult> {
  const { bytes, parsed, quote } = await buildFlashLoanTransaction(privyUserId, params);

  const agentWallet = await resolveSuiAgentWallet(privyUserId);
  const privyWallet = await fetchPrivyWallet(agentWallet.privy_wallet_id);

  const serializedSignature = await signTxBytes({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: agentWallet.address,
    publicKeyBase58: privyWallet.public_key!,
    transactionBytes: bytes,
  });

  const result = await executeSignedTx({
    transactionBytes: bytes,
    serializedSignature,
    suiAddress: agentWallet.address,
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    borrow_amount: parsed.borrow_amount,
    coin_key: parsed.coin_key,
    asset: parsed.asset,
    strategy: parsed.strategy,
    steps_count: parsed.steps?.length ?? 0,
    estimated_surplus: quote.estimated_surplus,
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
