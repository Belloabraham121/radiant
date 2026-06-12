import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getSolanaConnection } from "../../infrastructure/solana/client.js";
import { AppError } from "../../errors/app-error.js";
import { signAndSendSolanaTransaction } from "./solana-signing.service.js";

export type SolanaTransferInput = {
  privyWalletId: string;
  from: string;
  to: string;
  amountLamports: bigint;
  caip2?: string;
};

export type SolanaTxResult = {
  hash: string;
  solana_address: string;
  effects_status: "success" | "failure" | "unknown";
};

export function parseSolanaRecipient(params: Record<string, unknown>): string {
  const recipient = params.recipient ?? params.to;
  if (typeof recipient !== "string" || recipient.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.recipient must be a Solana address");
  }

  try {
    return new PublicKey(recipient).toBase58();
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "params.recipient must be a valid Solana address");
  }
}

export function parseAmountLamports(params: Record<string, unknown>): bigint {
  const raw = params.amount_lamports ?? params.amount_atomic;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.amount_lamports (or amount_atomic) must be a positive integer string",
    );
  }
  return BigInt(raw);
}

function lamportsToTransferNumber(lamports: bigint): number {
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.amount_lamports exceeds the maximum safe transfer amount",
    );
  }
  return Number(lamports);
}

export async function buildSolTransferTransaction(input: {
  from: string;
  to: string;
  amountLamports: bigint;
}): Promise<Uint8Array> {
  const connection = getSolanaConnection();
  const { blockhash } = await connection.getLatestBlockhash();
  const fromPubkey = new PublicKey(input.from);
  const toPubkey = new PublicKey(input.to);

  const instruction = SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports: lamportsToTransferNumber(input.amountLamports),
  });

  const message = new TransactionMessage({
    payerKey: fromPubkey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  return transaction.serialize();
}

export async function sendSolanaTransfer(input: SolanaTransferInput): Promise<SolanaTxResult> {
  const serialized = await buildSolTransferTransaction({
    from: input.from,
    to: input.to,
    amountLamports: input.amountLamports,
  });

  const { hash } = await signAndSendSolanaTransaction({
    privyWalletId: input.privyWalletId,
    transaction: serialized,
    caip2: input.caip2,
  });

  const connection = getSolanaConnection();
  let effectsStatus: SolanaTxResult["effects_status"] = "unknown";
  try {
    const confirmation = await connection.confirmTransaction(hash, "confirmed");
    effectsStatus = confirmation.value.err ? "failure" : "success";
  } catch {
    effectsStatus = "unknown";
  }

  return {
    hash,
    solana_address: input.from,
    effects_status: effectsStatus,
  };
}
