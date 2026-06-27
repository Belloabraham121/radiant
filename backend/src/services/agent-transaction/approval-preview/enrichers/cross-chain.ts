import type { ExecuteTransactionInput } from "../../../chains/types.js";
import { isSquidEnabled } from "../../../../config/squid.js";
import { AppError } from "../../../../errors/app-error.js";
import type { LiquidityFallbackOffer } from "../../../defi/cross-chain/cross-chain.types.js";
import { buildLiquidityFallbackOffer } from "../../../defi/cross-chain/cross-chain-fallback.service.js";
import { isLiquidityFallbackEligible } from "../../../defi/cross-chain/cross-chain-fallback.js";
import type { LifiRoutesInput } from "../../../defi/lifi/lifi.types.js";
import { isExecutableLifiRoute } from "../../../defi/lifi/lifi-normalize.js";
import { requoteLifiFromSnapshot } from "../../../defi/lifi/lifi-quote.service.js";
import {
  isLifiExecuteAction,
} from "../../../agent/chains/evm/lifi/execute-actions.js";
import { enrichLifiExecuteInputForApproval } from "./lifi.js";
import { enrichSquidExecuteInputForApproval, isSquidCrossChainRoute } from "./squid.js";

export type CrossChainEnrichOptions = {
  requoteOnCacheMiss?: boolean;
  forceRequote?: boolean;
};

export type CrossChainEnrichmentResult =
  | { kind: "enriched"; input: ExecuteTransactionInput }
  | {
      kind: "liquidity_fallback_offered";
      input: ExecuteTransactionInput;
      liquidity_fallback_offer: LiquidityFallbackOffer;
    };

function readString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readChainId(
  params: Record<string, unknown>,
  key: string,
): LifiRoutesInput["from_chain_id"] {
  const value = params[key];
  if (value === "sui" || value === "solana" || value === "ethereum") {
    return value;
  }
  return undefined;
}

function snapshotToRoutesInput(params: Record<string, unknown>): LifiRoutesInput {
  return {
    from_chain_id: readChainId(params, "from_chain_id"),
    to_chain_id: readChainId(params, "to_chain_id"),
    from_evm_chain_id:
      typeof params.from_evm_chain_id === "number" ? params.from_evm_chain_id : undefined,
    to_evm_chain_id:
      typeof params.to_evm_chain_id === "number" ? params.to_evm_chain_id : undefined,
    from_token:
      readString(params, "from_token_symbol") ?? readString(params, "from_token") ?? undefined,
    to_token: readString(params, "to_token_symbol") ?? readString(params, "to_token") ?? undefined,
    amount_atomic: readString(params, "from_amount_atomic") ?? undefined,
    slippage: typeof params.slippage === "number" ? params.slippage : undefined,
    confirm_same_token:
      typeof params.confirm_same_token === "boolean" ? params.confirm_same_token : undefined,
  };
}

async function safeBuildLiquidityFallbackOffer(
  privyUserId: string,
  routesInput: LifiRoutesInput,
  lifiError?: AppError,
): Promise<LiquidityFallbackOffer | null> {
  try {
    return await buildLiquidityFallbackOffer(privyUserId, routesInput, lifiError);
  } catch (err) {
    if (err instanceof AppError && err.code === "SQUID_UNAVAILABLE") {
      return null;
    }
    throw err;
  }
}

async function tryBuildLiquidityFallbackOffer(
  privyUserId: string,
  input: ExecuteTransactionInput,
  lifiError?: AppError,
): Promise<LiquidityFallbackOffer | null> {
  if (input.action !== "cross_chain_swap" || isSquidCrossChainRoute(input.params)) {
    return null;
  }
  if (!isSquidEnabled()) {
    return null;
  }

  const hasRoute = isExecutableLifiRoute(input.params.lifi_route ?? input.params.route);
  if (hasRoute) {
    return null;
  }

  const routesInput = snapshotToRoutesInput(input.params);
  if (!routesInput.from_token || !routesInput.to_token || !routesInput.amount_atomic) {
    return null;
  }

  if (lifiError && !isLiquidityFallbackEligible(lifiError)) {
    return null;
  }

  if (!lifiError) {
    let requoteError: unknown = null;
    const requoted = await requoteLifiFromSnapshot(privyUserId, input.params, {
      onError: (err) => {
        requoteError = err;
      },
    });
    if (requoted?.lifi_route && isExecutableLifiRoute(requoted.lifi_route)) {
      return null;
    }
    if (!isLiquidityFallbackEligible(requoteError ?? new AppError(404, "LIFI_NO_ROUTE", ""))) {
      return null;
    }
    return safeBuildLiquidityFallbackOffer(
      privyUserId,
      routesInput,
      requoteError instanceof AppError ? requoteError : undefined,
    );
  }

  return safeBuildLiquidityFallbackOffer(privyUserId, routesInput, lifiError);
}

export function matchCrossChainExecuteInput(input: ExecuteTransactionInput): boolean {
  return isLifiExecuteAction(input.action);
}

/** Cross-chain approval enricher — dispatches Li-Fi vs Squid and surfaces liquidity fallback offers. */
export async function enrichCrossChainExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: CrossChainEnrichOptions,
): Promise<CrossChainEnrichmentResult> {
  if (!matchCrossChainExecuteInput(input)) {
    return { kind: "enriched", input };
  }

  if (input.action === "cross_chain_swap" && isSquidCrossChainRoute(input.params)) {
    const enriched = await enrichSquidExecuteInputForApproval(privyUserId, input, options);
    return { kind: "enriched", input: enriched };
  }

  try {
    const enriched = await enrichLifiExecuteInputForApproval(privyUserId, input, options);
    if (input.action === "cross_chain_swap") {
      const fallback = await tryBuildLiquidityFallbackOffer(privyUserId, enriched);
      if (fallback) {
        return {
          kind: "liquidity_fallback_offered",
          input: enriched,
          liquidity_fallback_offer: fallback,
        };
      }
    }
    return { kind: "enriched", input: enriched };
  } catch (err) {
    if (
      input.action === "cross_chain_swap" &&
      err instanceof AppError &&
      err.code === "LIFI_NO_ROUTE"
    ) {
      const fallback = await tryBuildLiquidityFallbackOffer(privyUserId, input, err);
      if (fallback) {
        return {
          kind: "liquidity_fallback_offered",
          input,
          liquidity_fallback_offer: fallback,
        };
      }
    }
    throw err;
  }
}

/** Convenience wrapper returning execute input only (throws on unrecoverable enrich errors). */
export async function enrichCrossChainExecuteInput(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: CrossChainEnrichOptions,
): Promise<ExecuteTransactionInput> {
  const result = await enrichCrossChainExecuteInputForApproval(privyUserId, input, options);
  return result.input;
}
