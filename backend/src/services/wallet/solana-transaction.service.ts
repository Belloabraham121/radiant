import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
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

const NATIVE_SOL_TOKEN_MARKERS = new Set([
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "11111111111111111111111111111111",
  "sol",
]);

export function isSolanaNativeTokenAddress(tokenAddress: string): boolean {
  return NATIVE_SOL_TOKEN_MARKERS.has(tokenAddress.trim().toLowerCase());
}

function parseSplAmount(amountAtomic: bigint, field: string): bigint {
  if (amountAtomic <= 0n) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a positive integer string`);
  }
  return amountAtomic;
}

export async function buildSolanaSplTransferTransaction(input: {
  from: string;
  to: string;
  mint: string;
  amountAtomic: bigint;
}): Promise<Uint8Array> {
  const connection = getSolanaConnection();
  const { blockhash } = await connection.getLatestBlockhash();
  const fromPubkey = new PublicKey(input.from);
  const toOwner = new PublicKey(input.to);
  const mint = new PublicKey(input.mint);
  const sourceAta = getAssociatedTokenAddressSync(mint, fromPubkey);
  const destinationAta = getAssociatedTokenAddressSync(mint, toOwner);

  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(
      fromPubkey,
      destinationAta,
      toOwner,
      mint,
    ),
    createTransferInstruction(
      sourceAta,
      destinationAta,
      fromPubkey,
      parseSplAmount(input.amountAtomic, "amount"),
      [],
      TOKEN_PROGRAM_ID,
    ),
  ];

  const message = new TransactionMessage({
    payerKey: fromPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(message).serialize();
}

export type SendSolanaChainflipDepositInput = {
  privyWalletId: string;
  from: string;
  to: string;
  amountAtomic: bigint;
  fromTokenAddress: string;
  caip2?: string;
};

type SendSolanaChainflipDepositFn = (
  input: SendSolanaChainflipDepositInput,
) => Promise<SolanaTxResult>;

let sendSolanaChainflipDepositForTests: SendSolanaChainflipDepositFn | null = null;

export function setSendSolanaChainflipDepositForTests(
  fn: SendSolanaChainflipDepositFn | null,
): void {
  sendSolanaChainflipDepositForTests = fn;
}

/** Native SOL or SPL transfer to a Chainflip deposit address (Privy sign + broadcast). */
export async function sendSolanaChainflipDeposit(
  input: SendSolanaChainflipDepositInput,
): Promise<SolanaTxResult> {
  if (sendSolanaChainflipDepositForTests) {
    return sendSolanaChainflipDepositForTests(input);
  }
  return sendSolanaChainflipDepositLive(input);
}

async function sendSolanaChainflipDepositLive(
  input: SendSolanaChainflipDepositInput,
): Promise<SolanaTxResult> {
  if (isSolanaNativeTokenAddress(input.fromTokenAddress)) {
    return sendSolanaTransfer({
      privyWalletId: input.privyWalletId,
      from: input.from,
      to: input.to,
      amountLamports: input.amountAtomic,
      caip2: input.caip2,
    });
  }

  const serialized = await buildSolanaSplTransferTransaction({
    from: input.from,
    to: input.to,
    mint: input.fromTokenAddress,
    amountAtomic: input.amountAtomic,
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
