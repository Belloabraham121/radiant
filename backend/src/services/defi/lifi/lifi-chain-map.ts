import { getEnabledEvmChainIds } from "../../../config/evm.js";
import {
  assertEnabledLifiChainRef,
  filterEnabledLifiChainIds,
  LIFI_SOLANA_CHAIN_ID,
  LIFI_SUI_CHAIN_ID,
  lifiChainIdToRadiantChainRef,
  radiantChainRefToLifiChainId,
  type LifiChainRef,
} from "../../../config/lifi-chains.js";
import { AppError } from "../../../errors/app-error.js";
import type { SupportedToken } from "../../../config/supported-tokens.js";

/** Li-Fi native token sentinel (EVM). */
export const LIFI_NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Li-Fi native SOL representation. */
export const LIFI_SOLANA_NATIVE_TOKEN_ADDRESS = "11111111111111111111111111111111";

/** Li-Fi native SUI coin type (long form). */
export const LIFI_SUI_NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

export { filterEnabledLifiChainIds, LIFI_SOLANA_CHAIN_ID, LIFI_SUI_CHAIN_ID };
export type { LifiChainRef };

/** @deprecated Use radiantChainRefToLifiChainId — Radiant EVM ids match Li-Fi for enabled networks. */
export function evmChainIdToLifiChainId(evmChainId: number): number {
  assertEnabledLifiEvmChain(evmChainId);
  return evmChainId;
}

/** @deprecated Use lifiChainIdToRadiantChainRef — enabled EVM ids are 1:1 with Li-Fi. */
export function lifiChainIdToEvmChainId(lifiChainId: number): number {
  assertEnabledLifiEvmChain(lifiChainId);
  return lifiChainId;
}

export function assertEnabledLifiEvmChain(evmChainId: number): void {
  assertEnabledLifiChainRef({ chain_id: "ethereum", evm_chain_id: evmChainId });
}

export function radiantToLifiChainId(ref: LifiChainRef): number {
  assertEnabledLifiChainRef(ref);
  return radiantChainRefToLifiChainId(ref);
}

export function lifiToRadiantChainRef(lifiChainId: number): LifiChainRef {
  const ref = lifiChainIdToRadiantChainRef(lifiChainId);
  if (!ref) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", `Li-Fi chain ${lifiChainId} is not enabled.`, {
      lifi_chain_id: lifiChainId,
    });
  }
  assertEnabledLifiChainRef(ref);
  return ref;
}

export function toLifiTokenAddress(token: SupportedToken, chainRef: LifiChainRef): string {
  if (chainRef.chain_id === "sui") {
    if (token.kind === "native" || token.symbol === "SUI") {
      return token.address ?? LIFI_SUI_NATIVE_TOKEN_ADDRESS;
    }
    if (!token.address) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Token ${token.symbol} has no Sui coin type for Li-Fi.`,
        { symbol: token.symbol },
      );
    }
    return token.address;
  }

  if (chainRef.chain_id === "solana") {
    if (token.kind === "native" || token.symbol === "SOL") {
      return LIFI_SOLANA_NATIVE_TOKEN_ADDRESS;
    }
    if (!token.address) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Token ${token.symbol} has no Solana mint for Li-Fi.`,
        { symbol: token.symbol },
      );
    }
    return token.address;
  }

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
  return token.address.toLowerCase();
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

/** Legacy helper — prefer filterEnabledLifiChainIds from config. */
export function getEnabledLifiEvmChainIds(): number[] {
  return getEnabledEvmChainIds();
}
