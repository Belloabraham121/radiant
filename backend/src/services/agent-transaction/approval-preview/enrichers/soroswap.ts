import type { ExecuteTransactionInput } from "../../../chains/types.js";
import { AppError } from "../../../../errors/app-error.js";
import {
  buildStellarRoutingFallbackOffer,
  detectStellarRoutingFallback,
} from "../../../defi/stellar-routing/stellar-routing-fallback.service.js";
import type { StellarRoutingFallbackOffer } from "../../../defi/stellar-routing/stellar-routing.types.js";
import { isSoroswapExecuteAction } from "../../../agent/chains/stellar/soroswap/execute-actions.js";
import { isDeFiQuoteFresh } from "../quote-expiry.js";
import {
  applySoroswapQuoteToExecuteParams,
  isSoroswapApprovalDisplayComplete,
  resolveSoroswapApprovalParams,
} from "./soroswap-route-params.js";

export type SoroswapEnrichmentResult =
  | { kind: "enriched"; input: ExecuteTransactionInput }
  | {
      kind: "stellar_routing_fallback_offered";
      input: ExecuteTransactionInput;
      stellar_routing_fallback_offer: StellarRoutingFallbackOffer;
    };

function readString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(params: Record<string, unknown>, key: string): number | null {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isSoroswapRoute(params: Record<string, unknown>): boolean {
  if (params.provider_id === "stellar-soroswap") {
    return true;
  }
  const routeId = params.route_id ?? params.quote_id;
  return typeof routeId === "string" && routeId.startsWith("soroswap:");
}

export function matchSoroswapExecuteInput(input: ExecuteTransactionInput): boolean {
  return isSoroswapExecuteAction(input.action);
}

async function tryBuildStellarRoutingFallbackOffer(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<StellarRoutingFallbackOffer | null> {
  if (input.chain_id === "stellar") {
    return null;
  }

  const tokenIn = readString(input.params, "token_in") ?? readString(input.params, "from_token");
  const tokenOut = readString(input.params, "token_out") ?? readString(input.params, "to_token");
  const amount =
    readString(input.params, "amount") ??
    readString(input.params, "amount_atomic") ??
    readString(input.params, "input_amount_atomic");
  if (!tokenIn || !tokenOut || !amount) {
    return null;
  }

  const tradeType = input.params.trade_type;
  const slippage = readNumber(input.params, "slippage") ?? undefined;

  if (
    !detectStellarRoutingFallback({
      inputCoin: tokenIn,
      outputCoin: tokenOut,
      chainId: input.chain_id,
      evmChainId: readNumber(input.params, "evm_chain_id") ?? undefined,
      originalMessage: "",
    })
  ) {
    return null;
  }

  return buildStellarRoutingFallbackOffer(
    privyUserId,
    {
      token_in: tokenIn,
      token_out: tokenOut,
      amount,
      chain_id: input.chain_id,
      ...(readNumber(input.params, "evm_chain_id") !== null
        ? { evm_chain_id: readNumber(input.params, "evm_chain_id")! }
        : {}),
      ...(tradeType === "EXACT_IN" || tradeType === "EXACT_OUT"
        ? { trade_type: tradeType }
        : {}),
      ...(slippage !== undefined ? { slippage } : {}),
    },
    new AppError(400, "CROSS_ECOSYSTEM_NOT_SUPPORTED", "Swap is not available on the selected network."),
  );
}

/** Attach Soroswap quote display fields before showing the approval dialog. */
export async function enrichSoroswapExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: { requoteOnCacheMiss?: boolean; forceRequote?: boolean },
): Promise<SoroswapEnrichmentResult> {
  if (!matchSoroswapExecuteInput(input)) {
    return { kind: "enriched", input };
  }

  const fallback = await tryBuildStellarRoutingFallbackOffer(privyUserId, input);
  if (fallback) {
    return {
      kind: "stellar_routing_fallback_offered",
      input,
      stellar_routing_fallback_offer: fallback,
    };
  }

  if (input.chain_id !== "stellar") {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "stellar_swap requires chain_id stellar.",
    );
  }

  const quoteRef = readString(input.params, "quote_id") ?? readString(input.params, "route_id");
  const hasXdr =
    readString(input.params, "transaction_xdr") ??
    readString(input.params, "unsigned_xdr") ??
    readString(input.params, "xdr");
  if (!quoteRef && !hasXdr && !isSoroswapRoute(input.params)) {
    throw new AppError(
      400,
      "SOROSWAP_NO_QUOTE",
      "No Stellar swap quote found. Run stellar_swap_quote first, then pass quote_id (or route_id) and snapshot fields to stellar_swap.",
    );
  }

  if (
    hasXdr ||
    (!options?.forceRequote &&
      isDeFiQuoteFresh(input.params) &&
      isSoroswapApprovalDisplayComplete(input.params))
  ) {
    return { kind: "enriched", input };
  }

  const params = await resolveSoroswapApprovalParams(input.params, {
    privyUserId,
    requoteOnCacheMiss: options?.requoteOnCacheMiss ?? true,
    forceRequote: options?.forceRequote,
  });
  return { kind: "enriched", input: { ...input, params } };
}

/** Convenience wrapper returning execute input only. */
export async function enrichSoroswapExecuteInput(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: { requoteOnCacheMiss?: boolean; forceRequote?: boolean },
): Promise<ExecuteTransactionInput> {
  const result = await enrichSoroswapExecuteInputForApproval(privyUserId, input, options);
  if (result.kind === "stellar_routing_fallback_offered") {
    return result.input;
  }
  return result.input;
}

export { applySoroswapQuoteToExecuteParams };
