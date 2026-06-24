import type { Hex } from "viem";
import { createEvmWalletClient, getEvmPublicClient } from "../../infrastructure/evm/client.js";
import { AppError } from "../../errors/app-error.js";
import { resolveEvmChainId } from "../../config/evm.js";
import { createPrivyViemAccount } from "./evm-signing.service.js";

export type EvmTransferInput = {
  privyWalletId: string;
  from: string;
  to: string;
  amountWei: bigint;
  evmChainId?: number;
};

export type EvmTxResult = {
  hash: string;
  evm_address: string;
  evm_chain_id: number;
  effects_status: "success" | "failure" | "unknown";
};

export async function sendEvmTransfer(input: EvmTransferInput): Promise<EvmTxResult> {
  const evmChainId = resolveEvmChainId(input.evmChainId);
  const account = createPrivyViemAccount({
    privyWalletId: input.privyWalletId,
    address: input.from,
  });

  const walletClient = createEvmWalletClient(evmChainId, account);
  const publicClient = getEvmPublicClient(evmChainId);

  const hash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to: input.to as Hex,
    value: input.amountWei,
  });

  let effectsStatus: EvmTxResult["effects_status"] = "unknown";
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    effectsStatus = receipt.status === "success" ? "success" : "failure";
  } catch {
    effectsStatus = "unknown";
  }

  return {
    hash,
    evm_address: input.from,
    evm_chain_id: evmChainId,
    effects_status: effectsStatus,
  };
}

export function parseEvmRecipient(params: Record<string, unknown>): Hex {
  const recipient = params.recipient ?? params.to;
  if (typeof recipient !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    throw new AppError(400, "VALIDATION_ERROR", "params.recipient must be a valid EVM address");
  }
  return recipient as Hex;
}

export function parseAmountWei(params: Record<string, unknown>): bigint {
  const raw = params.amount_wei ?? params.amount_atomic;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.amount_wei (or amount_atomic) must be a positive integer string",
    );
  }
  return BigInt(raw);
}

export function parseEvmChainIdParam(params: Record<string, unknown>): number | undefined {
  const raw = params.evm_chain_id;
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.evm_chain_id must be a positive integer");
  }
  return parsed;
}

/** Read an optional EVM chain id from params without throwing (checks common Li-Fi keys). */
export function readOptionalEvmChainIdParam(params: Record<string, unknown>): number | undefined {
  for (const key of ["evm_chain_id", "from_evm_chain_id"] as const) {
    const raw = params[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}
