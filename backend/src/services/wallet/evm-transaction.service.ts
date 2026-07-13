import { erc20Abi, parseUnits, type Hex } from "viem";
import { createEvmWalletClient, getEvmPublicClient } from "../../infrastructure/evm/client.js";
import { AppError } from "../../errors/app-error.js";
import { resolveEvmChainId } from "../../config/evm.js";
import { resolveTokenSymbol, type TokenResolveExact } from "../../config/supported-tokens.js";
import { createPrivyViemAccount } from "./evm-signing.service.js";

export type EvmTransferInput = {
  privyWalletId: string;
  from: string;
  to: string;
  amountWei: bigint;
  evmChainId?: number;
};

export type EvmTokenTransferInput = {
  privyWalletId: string;
  from: string;
  to: string;
  /** ERC-20 contract address. */
  tokenAddress: string;
  /** Amount in the token's smallest unit. */
  amountAtomic: bigint;
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

export async function sendEvmTokenTransfer(input: EvmTokenTransferInput): Promise<EvmTxResult> {
  const evmChainId = resolveEvmChainId(input.evmChainId);
  const account = createPrivyViemAccount({
    privyWalletId: input.privyWalletId,
    address: input.from,
  });

  const walletClient = createEvmWalletClient(evmChainId, account);
  const publicClient = getEvmPublicClient(evmChainId);

  // Simulate first so reverts (insufficient balance, paused token) fail before signing.
  const { request } = await publicClient.simulateContract({
    account,
    address: input.tokenAddress as Hex,
    abi: erc20Abi,
    functionName: "transfer",
    args: [input.to as Hex, input.amountAtomic],
  });

  const hash = await walletClient.writeContract({ ...request, chain: walletClient.chain });

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

/** Parse a human-readable token amount (e.g. 0.001) into atomic units for `decimals`. */
export function parseDisplayAmountToAtomic(value: unknown, decimals: number): bigint | null {
  const raw =
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value.toString()
      : typeof value === "string" && value.trim().length > 0
        ? value.trim().replace(/,/g, "")
        : null;
  if (raw === null || !/^\d*\.?\d+$/.test(raw)) {
    return null;
  }

  try {
    const atomic = parseUnits(raw, decimals);
    return atomic > 0n ? atomic : null;
  } catch {
    return null;
  }
}

export function parseAmountWei(params: Record<string, unknown>): bigint {
  const raw = params.amount_wei ?? params.amount_atomic;
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw)) {
    return BigInt(raw);
  }

  if (raw === undefined || raw === null) {
    const display = parseDisplayAmountToAtomic(
      params.amount_display ?? params.amount_eth,
      18,
    );
    if (display !== null) {
      return display;
    }
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "params.amount_wei (or amount_atomic) must be a positive integer string — or pass amount_display in ETH",
  );
}

/** Parse an ERC-20 transfer amount: atomic string first, then display units. */
export function parseTokenAmountAtomic(
  params: Record<string, unknown>,
  decimals: number,
): bigint {
  const raw = params.amount_atomic ?? params.amount_wei;
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw)) {
    return BigInt(raw);
  }

  if (raw === undefined || raw === null) {
    const display = parseDisplayAmountToAtomic(params.amount_display ?? params.amount, decimals);
    if (display !== null) {
      return display;
    }
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "params.amount_atomic must be a positive integer string — or pass amount_display in token units",
  );
}

/** EVM token transfer actions (ERC-20 or native by resolved token kind). */
export const EVM_TOKEN_TRANSFER_ACTIONS = ["transfer_token", "transfer_erc20"] as const;

export function isEvmTokenTransferAction(action: string): boolean {
  return (EVM_TOKEN_TRANSFER_ACTIONS as readonly string[]).includes(action);
}

/** Read the token symbol / address param for transfer_token. */
export function readEvmTransferTokenParam(params: Record<string, unknown>): string {
  const raw =
    params.token ?? params.token_symbol ?? params.symbol ?? params.token_address ?? params.coin;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.token is required for transfer_token (symbol like USDC, or an ERC-20 contract address)",
    );
  }
  return raw.trim();
}

/** Resolve the transfer token to an allowlisted entry — fuzzy matches never execute. */
export function resolveEvmTransferToken(
  params: Record<string, unknown>,
  evmChainId?: number,
): TokenResolveExact {
  const tokenInput = readEvmTransferTokenParam(params);
  const resolved = resolveTokenSymbol("ethereum", tokenInput, evmChainId);
  if (resolved.match !== "exact") {
    const suggestions = resolved.suggestions.map((entry) => entry.symbol).join(", ");
    throw new AppError(
      400,
      "TOKEN_NOT_RECOGNIZED",
      `Token "${tokenInput}" is not an exact match on this network.` +
        (suggestions ? ` Did you mean: ${suggestions}?` : ""),
      { symbol: tokenInput, evm_chain_id: evmChainId },
    );
  }
  return resolved;
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
