import {
  assertEnabledLifiChainRef,
  isLifiCrossEcosystemPair,
  resolveLifiChainRef,
  type LifiChainRef,
} from "../../../config/lifi-chains.js";
import {
  assertCrossEcosystemSupported,
  resolveTokenSymbol,
  type SupportedToken,
} from "../../../config/supported-tokens.js";
import { AppError } from "../../../errors/app-error.js";
import type { ChainId } from "../../chains/types.js";
import { toLifiTokenAddress } from "./lifi-chain-map.js";

export type ResolvedLifiChainPair = {
  from: LifiChainRef;
  to: LifiChainRef;
  fromToken: SupportedToken;
  toToken: SupportedToken;
  fromSymbol: string;
  toSymbol: string;
};

function assertLifiCrossChainPair(fromChainId: ChainId, toChainId: ChainId): void {
  if (fromChainId === toChainId) {
    return;
  }
  if (isLifiCrossEcosystemPair(fromChainId, toChainId)) {
    return;
  }
  assertCrossEcosystemSupported(fromChainId, toChainId);
}

export function resolveLifiTokens(input: {
  from_chain_id?: ChainId;
  to_chain_id?: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  fromToken: string;
  toToken: string;
}): ResolvedLifiChainPair {
  const from = resolveLifiChainRef({
    chain_id: input.from_chain_id ?? (input.from_evm_chain_id !== undefined ? "ethereum" : undefined),
    evm_chain_id: input.from_evm_chain_id,
  });
  const to = resolveLifiChainRef({
    chain_id: input.to_chain_id ?? (input.to_evm_chain_id !== undefined ? "ethereum" : undefined),
    evm_chain_id: input.to_evm_chain_id,
  });

  assertEnabledLifiChainRef(from);
  assertEnabledLifiChainRef(to);
  assertLifiCrossChainPair(from.chain_id, to.chain_id);

  const fromResolved = resolveTokenSymbol(
    from.chain_id,
    input.fromToken,
    from.chain_id === "ethereum" ? from.evm_chain_id : undefined,
  );
  const toResolved = resolveTokenSymbol(
    to.chain_id,
    input.toToken,
    to.chain_id === "ethereum" ? to.evm_chain_id : undefined,
  );

  if (fromResolved.match !== "exact" || toResolved.match !== "exact") {
    throw new AppError(400, "TOKEN_NOT_RECOGNIZED", "Token symbols must be exact allowlist matches.");
  }

  return {
    from,
    to,
    fromToken: fromResolved.token,
    toToken: toResolved.token,
    fromSymbol: fromResolved.symbol,
    toSymbol: toResolved.symbol,
  };
}

export { toLifiTokenAddress };
