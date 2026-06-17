import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { getSuiClient } from "../../infrastructure/sui/client.js";
import { withSuiRpcRetry } from "../../infrastructure/sui/rpc-retry.js";
import { AppError } from "../../errors/app-error.js";
import type { SuiTxResult } from "../chains/types.js";

function mapEffectsStatus(
  status: { success?: boolean; failure?: { error?: string } } | undefined,
): SuiTxResult["effects_status"] {
  if (!status) return "unknown";
  if (status.success) return "success";
  if (status.failure) return "failure";
  return "unknown";
}

export async function buildTransferSuiTransaction(input: {
  sender: string;
  recipient: string;
  amountMist: bigint;
}): Promise<Uint8Array> {
  if (input.amountMist <= 0n) {
    throw new AppError(400, "VALIDATION_ERROR", "Transfer amount must be greater than zero");
  }

  const client = getSuiClient();
  const tx = new Transaction();
  tx.setSender(input.sender);
  tx.transferObjects([coinWithBalance({ balance: input.amountMist })], input.recipient);

  return withSuiRpcRetry(() => tx.build({ client }));
}

export async function executeSignedSuiTransaction(input: {
  transactionBytes: Uint8Array;
  serializedSignature: string;
  suiAddress: string;
}): Promise<SuiTxResult> {
  const client = getSuiClient();
  const result = await withSuiRpcRetry(() =>
    client.executeTransaction({
      transaction: input.transactionBytes,
      signatures: [input.serializedSignature],
      include: { effects: true },
    }),
  );

  if (result.$kind === "FailedTransaction") {
    const failedDigest = result.FailedTransaction.digest;
    const message =
      (result.FailedTransaction.effects?.status as { failure?: { error?: string } } | undefined)
        ?.failure?.error ?? "Transaction failed on-chain";
    throw new AppError(502, "TRANSACTION_FAILED", message, { digest: failedDigest });
  }

  const tx = result.Transaction;
  const digest = tx.digest;
  if (!digest) {
    throw new AppError(502, "TRANSACTION_FAILED", "Transaction executed without a digest");
  }

  const effectsStatus = mapEffectsStatus(
    tx.effects?.status as { success?: boolean; failure?: { error?: string } } | undefined,
  );

  if (effectsStatus === "failure") {
    const message =
      (tx.effects?.status as { failure?: { error?: string } } | undefined)?.failure?.error ??
      "Transaction failed on-chain";
    throw new AppError(502, "TRANSACTION_FAILED", message, { digest });
  }

  return {
    digest,
    sui_address: input.suiAddress,
    effects_status: effectsStatus,
  };
}

type ChangedObject = {
  objectId: string;
  idOperation?: string;
};

type TransactionWithEffects = {
  effects?: { changedObjects?: ChangedObject[] };
  objectTypes?: Record<string, string>;
};

/** Resolve a newly created shared object id from a successful transaction digest. */
export async function findCreatedObjectIdAfterTransaction(
  digest: string,
  typeIncludes: string,
): Promise<string | null> {
  const client = getSuiClient();
  const result = await client.waitForTransaction({
    digest,
    include: { effects: true, objectTypes: true },
  });

  if (result.$kind === "FailedTransaction") {
    return null;
  }

  const tx = result.Transaction as TransactionWithEffects | undefined;
  if (!tx?.effects?.changedObjects) {
    return null;
  }

  const objectTypes = tx.objectTypes ?? {};
  for (const changed of tx.effects.changedObjects) {
    if (changed.idOperation !== "Created") continue;
    const objectType = objectTypes[changed.objectId];
    if (objectType?.includes(typeIncludes)) {
      return changed.objectId;
    }
  }

  return null;
}
