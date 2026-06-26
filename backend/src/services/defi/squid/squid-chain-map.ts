import { getEnabledEvmChainIds } from "../../../config/evm.js";
import {
  assertEnabledSquidChainRef,
  filterEnabledSquidChainIds,
  radiantChainRefToSquidChainId,
  SQUID_SOLANA_CHAIN_ID,
  SQUID_STELLAR_CHAIN_ID,
  SQUID_SUI_CHAIN_ID,
  squidChainIdToRadiantChainRef,
  type SquidChainRef,
} from "../../../config/squid-chains.js";
import { AppError } from "../../../errors/app-error.js";
import type { SupportedToken } from "../../../config/supported-tokens.js";

/** Squid native EVM token sentinel. */
export const SQUID_NATIVE_EVM_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

/** Squid native SOL representation. */
export const SQUID_SOLANA_NATIVE_TOKEN_ADDRESS = "11111111111111111111111111111111";

/** Squid native SUI coin type (long form). */
export const SQUID_SUI_NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

export { filterEnabledSquidChainIds, SQUID_SOLANA_CHAIN_ID, SQUID_STELLAR_CHAIN_ID, SQUID_SUI_CHAIN_ID };
export type { SquidChainRef };

export function radiantToSquidChainId(ref: SquidChainRef): string {
  assertEnabledSquidChainRef(ref);
  return radiantChainRefToSquidChainId(ref);
}

export function squidToRadiantChainRef(squidChainId: string): SquidChainRef {
  const ref = squidChainIdToRadiantChainRef(squidChainId);
  if (!ref) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", `Squid chain ${squidChainId} is not enabled.`, {
      squid_chain_id: squidChainId,
    });
  }
  assertEnabledSquidChainRef(ref);
  return ref;
}

export function toSquidTokenAddress(token: SupportedToken, chainRef: SquidChainRef): string {
  if (chainRef.chain_id === "sui") {
    if (token.kind === "native" || token.symbol === "SUI") {
      return token.address ?? SQUID_SUI_NATIVE_TOKEN_ADDRESS;
    }
    if (!token.address) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Token ${token.symbol} has no Sui coin type for Squid.`,
        { symbol: token.symbol },
      );
    }
    return token.address;
  }

  if (chainRef.chain_id === "solana") {
    if (token.kind === "native" || token.symbol === "SOL") {
      return SQUID_SOLANA_NATIVE_TOKEN_ADDRESS;
    }
    if (!token.address) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Token ${token.symbol} has no Solana mint for Squid.`,
        { symbol: token.symbol },
      );
    }
    return token.address;
  }

  if (chainRef.chain_id === "stellar") {
    if (token.kind === "native" || token.symbol === "XLM") {
      return "native";
    }
    if (token.stellar_asset_code && token.stellar_issuer) {
      return `${token.stellar_asset_code}:${token.stellar_issuer}`;
    }
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Token ${token.symbol} has no Stellar asset mapping for Squid.`,
      { symbol: token.symbol },
    );
  }

  if (token.kind === "native" || token.symbol === "ETH") {
    return SQUID_NATIVE_EVM_TOKEN_ADDRESS;
  }
  if (!token.address) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Token ${token.symbol} has no on-chain address for Squid.`,
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

export function getEnabledSquidEvmChainIds(): number[] {
  return getEnabledEvmChainIds();
}
