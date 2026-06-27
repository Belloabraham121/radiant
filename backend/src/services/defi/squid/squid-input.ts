import {
  assertEnabledSquidChainRef,
  isSquidCrossEcosystemPair,
  resolveSquidChainRef,
  type SquidChainRef,
} from "../../../config/squid-chains.js";
import { formatRadiantChainLabel } from "../../agent-transaction/approval-preview/chain-labels.js";
import {
  assertCrossEcosystemSupported,
  resolveEvmTokenByAddress,
  resolveTokenSymbol,
  type SupportedToken,
} from "../../../config/supported-tokens.js";
import { AppError } from "../../../errors/app-error.js";
import type { ChainId } from "../../chains/types.js";
import { toSquidTokenAddress } from "./squid-chain-map.js";

export type ResolvedSquidChainPair = {
  from: SquidChainRef;
  to: SquidChainRef;
  fromToken: SupportedToken;
  toToken: SupportedToken;
  fromSymbol: string;
  toSymbol: string;
};

function assertSquidCrossChainPair(fromChainId: ChainId, toChainId: ChainId): void {
  if (fromChainId === toChainId) {
    return;
  }
  if (isSquidCrossEcosystemPair(fromChainId, toChainId)) {
    return;
  }
  assertCrossEcosystemSupported(fromChainId, toChainId);
}

function isCrossChainBridge(from: SquidChainRef, to: SquidChainRef): boolean {
  if (from.chain_id !== to.chain_id) {
    return true;
  }
  if (from.chain_id === "ethereum" && to.chain_id === "ethereum") {
    return from.evm_chain_id !== to.evm_chain_id;
  }
  return false;
}

function isEvmAddressInput(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 42 && trimmed.slice(0, 2).toLowerCase() === "0x";
}

function normalizeSquidTokenInput(token: string, chainRef: SquidChainRef): string {
  if (chainRef.chain_id === "ethereum" && isEvmAddressInput(token)) {
    const resolved = resolveEvmTokenByAddress(chainRef.evm_chain_id, token);
    if (resolved) {
      return resolved.symbol;
    }
  }
  return token;
}

function isPositiveAtomicAmount(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("0")) {
    return false;
  }
  for (const char of trimmed) {
    if (char < "0" || char > "9") {
      return false;
    }
  }
  return true;
}

export function assertBridgeQuoteParams(input: {
  from_token?: string;
  to_token?: string;
  amount_atomic?: string;
}): void {
  if (!input.from_token?.trim()) {
    throw new AppError(
      400,
      "SOURCE_TOKEN_REQUIRED",
      "Which token should the user bridge from? Ask for the source token and amount before quoting.",
    );
  }
  if (!input.amount_atomic?.trim() || !isPositiveAtomicAmount(input.amount_atomic)) {
    throw new AppError(
      400,
      "AMOUNT_REQUIRED",
      "How much should they bridge? Ask for the amount before quoting.",
    );
  }
  if (!input.to_token?.trim()) {
    throw new AppError(
      400,
      "DESTINATION_TOKEN_REQUIRED",
      "Which token should they receive on the destination? Ask the user before quoting.",
    );
  }
}

export function assertBridgeDestinationToken(input: {
  from: SquidChainRef;
  to: SquidChainRef;
  fromToken: string;
  toToken: string;
  confirmSameToken?: boolean;
}): void {
  if (input.from.chain_id === input.to.chain_id) {
    return;
  }
  if (!isCrossChainBridge(input.from, input.to)) {
    return;
  }
  if (input.confirmSameToken) {
    return;
  }
  if (input.fromToken.toUpperCase() !== input.toToken.toUpperCase()) {
    return;
  }

  throw new AppError(
    400,
    "DESTINATION_TOKEN_REQUIRED",
    `Which token should you receive on ${formatSquidChainRefLabel(input.to)}? Ask the user to choose (e.g. USDC, ETH).`,
  );
}

function formatSquidChainRefLabel(ref: SquidChainRef): string {
  if (ref.chain_id === "ethereum") {
    return formatRadiantChainLabel("ethereum", ref.evm_chain_id);
  }
  return formatRadiantChainLabel(ref.chain_id);
}

export function resolveSquidTokens(input: {
  from_chain_id?: ChainId;
  to_chain_id?: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  fromToken: string;
  toToken: string;
  amountAtomic?: string;
  confirmSameToken?: boolean;
}): ResolvedSquidChainPair {
  const from = resolveSquidChainRef({
    chain_id: input.from_chain_id ?? (input.from_evm_chain_id !== undefined ? "ethereum" : undefined),
    evm_chain_id: input.from_evm_chain_id,
  });
  const to = resolveSquidChainRef({
    chain_id: input.to_chain_id ?? (input.to_evm_chain_id !== undefined ? "ethereum" : undefined),
    evm_chain_id: input.to_evm_chain_id,
  });

  assertBridgeQuoteParams({
    from_token: input.fromToken,
    to_token: input.toToken,
    amount_atomic: input.amountAtomic,
  });

  assertEnabledSquidChainRef(from);
  assertEnabledSquidChainRef(to);
  assertSquidCrossChainPair(from.chain_id, to.chain_id);
  assertBridgeDestinationToken({
    from,
    to,
    fromToken: input.fromToken,
    toToken: input.toToken,
    confirmSameToken: input.confirmSameToken,
  });

  const fromTokenInput = normalizeSquidTokenInput(input.fromToken, from);
  const toTokenInput = normalizeSquidTokenInput(input.toToken, to);

  const fromResolved = resolveTokenSymbol(
    from.chain_id,
    fromTokenInput,
    from.chain_id === "ethereum" ? from.evm_chain_id : undefined,
  );
  const toResolved = resolveTokenSymbol(
    to.chain_id,
    toTokenInput,
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

export { toSquidTokenAddress };
