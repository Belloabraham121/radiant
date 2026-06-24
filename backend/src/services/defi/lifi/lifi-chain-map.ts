import { getEnabledEvmChainIds } from "../../../config/evm.js";
import { AppError } from "../../../errors/app-error.js";
import type { SupportedToken } from "../../../config/supported-tokens.js";

/** Li-Fi native token sentinel (EVM). */
export const LIFI_NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Radiant `evm_chain_id` matches Li-Fi EVM chain id for enabled networks. */
export function evmChainIdToLifiChainId(evmChainId: number): number {
  assertEnabledLifiEvmChain(evmChainId);
  return evmChainId;
}

export function lifiChainIdToEvmChainId(lifiChainId: number): number {
  assertEnabledLifiEvmChain(lifiChainId);
  return lifiChainId;
}

export function assertEnabledLifiEvmChain(evmChainId: number): void {
  if (!getEnabledEvmChainIds().includes(evmChainId)) {
    throw new AppError(
      400,
      "CHAIN_NOT_ENABLED",
      `EVM chain ${evmChainId} is not enabled for Li-Fi.`,
      { evm_chain_id: evmChainId },
    );
  }
}

export function toLifiTokenAddress(token: SupportedToken): string {
  if (token.kind === "native" || token.symbol === "ETH") {
    return LIFI_NATIVE_TOKEN_ADDRESS;
  }
  if (!token.address) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Token ${token.symbol} has no on-chain address for Li-Fi.`,
      { symbol: token.symbol },
    );
  }
  return token.address;
}

export function formatAtomicAmount(amountAtomic: string, decimals: number): string {
  if (!/^[1-9]\d*$/.test(amountAtomic)) {
    throw new AppError(400, "VALIDATION_ERROR", "amount_atomic must be a positive integer string.");
  }
  const value = BigInt(amountAtomic);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionStr}`;
}
