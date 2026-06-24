import {
  Asset,
  BASE_FEE,
  Operation,
  Transaction,
  TransactionBuilder,
  rpc,
} from "@stellar/stellar-sdk";
import { getHorizonServer, getSorobanServer } from "../../infrastructure/stellar/client.js";
import { mapStellarSimulationError, mapStellarSubmitError } from "../../infrastructure/stellar/errors.js";
import { withStellarRpcRetry } from "../../infrastructure/stellar/rpc-retry.js";
import { getStellarPassphrase } from "../../config/stellar.js";
import { AppError } from "../../errors/app-error.js";
import { stroopsToAmountString } from "../../utils/stellar-amount.js";
import { signStellarTransaction } from "./stellar-signing.service.js";

export type StellarTxResult = {
  hash: string;
  stellar_address: string;
  effects_status: "success" | "failure" | "unknown";
};

export async function buildTransferNativeTransaction(input: {
  sourceAddress: string;
  recipient: string;
  amountStroops: bigint;
}): Promise<Transaction> {
  const horizon = getHorizonServer();
  const source = await withStellarRpcRetry(() => horizon.loadAccount(input.sourceAddress));
  const amount = stroopsToAmountString(input.amountStroops);

  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: getStellarPassphrase(),
  })
    .addOperation(
      Operation.payment({
        destination: input.recipient,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(180)
    .build();
}

export function parseTransactionXdr(xdr: string): Transaction {
  try {
    return new Transaction(xdr, getStellarPassphrase());
  } catch (err) {
    throw new AppError(400, "VALIDATION_ERROR", "params.transaction_xdr must be valid Stellar XDR", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function simulateStellarTransaction(transaction: Transaction): Promise<void> {
  const soroban = getSorobanServer();
  try {
    const result = await withStellarRpcRetry(() => soroban.simulateTransaction(transaction));
    if (rpc.Api.isSimulationError(result)) {
      throw mapStellarSimulationError(new Error(result.error ?? "Simulation failed"));
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw mapStellarSimulationError(err);
  }
}

export async function broadcastSignedStellarTransaction(input: {
  transaction: Transaction;
  stellarAddress: string;
}): Promise<StellarTxResult> {
  const soroban = getSorobanServer();
  try {
    const response = await withStellarRpcRetry(() => soroban.sendTransaction(input.transaction));

    if (response.status === "ERROR") {
      throw mapStellarSubmitError({ status: response.status });
    }

    const hash = response.hash ?? input.transaction.hash().toString("hex");
    const effectsStatus: StellarTxResult["effects_status"] =
      response.status === "PENDING" || response.status === "DUPLICATE" ? "unknown" : "success";

    return {
      hash,
      stellar_address: input.stellarAddress,
      effects_status: effectsStatus,
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw mapStellarSimulationError(err);
  }
}

export async function executeSignedStellarTransaction(input: {
  privyWalletId: string;
  stellarAddress: string;
  transaction: Transaction;
  simulate?: boolean;
}): Promise<StellarTxResult> {
  if (input.simulate !== false) {
    await simulateStellarTransaction(input.transaction);
  }

  await signStellarTransaction({
    privyWalletId: input.privyWalletId,
    stellarAddress: input.stellarAddress,
    transaction: input.transaction,
  });

  return broadcastSignedStellarTransaction({
    transaction: input.transaction,
    stellarAddress: input.stellarAddress,
  });
}
