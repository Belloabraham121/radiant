import {
  assertCrossEcosystemSupported,
  resolveTokenSymbol,
  type SupportedToken,
} from "../../../config/supported-tokens.js";
import { AppError } from "../../../errors/app-error.js";
import { assertEnabledLifiEvmChain } from "./lifi-chain-map.js";

export function resolveLifiTokens(input: {
  fromEvmChainId: number;
  toEvmChainId: number;
  fromToken: string;
  toToken: string;
}): {
  fromToken: SupportedToken;
  toToken: SupportedToken;
  fromSymbol: string;
  toSymbol: string;
} {
  assertCrossEcosystemSupported("ethereum", "ethereum");
  assertEnabledLifiEvmChain(input.fromEvmChainId);
  assertEnabledLifiEvmChain(input.toEvmChainId);

  const fromResolved = resolveTokenSymbol("ethereum", input.fromToken, input.fromEvmChainId);
  const toResolved = resolveTokenSymbol("ethereum", input.toToken, input.toEvmChainId);

  if (fromResolved.match !== "exact" || toResolved.match !== "exact") {
    throw new AppError(400, "TOKEN_NOT_RECOGNIZED", "Token symbols must be exact allowlist matches.");
  }

  return {
    fromToken: fromResolved.token,
    toToken: toResolved.token,
    fromSymbol: fromResolved.symbol,
    toSymbol: toResolved.symbol,
  };
}
