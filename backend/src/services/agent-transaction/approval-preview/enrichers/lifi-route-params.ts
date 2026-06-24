import type { Route } from "@lifi/types";
import { resolveTokenSymbol, resolveEvmTokenByAddress } from "../../../../config/supported-tokens.js";
import type { ChainId } from "../../../chains/types.js";
import { formatAtomicAmount, lifiToRadiantChainRef } from "../../../defi/lifi/lifi-chain-map.js";
import { normalizeLifiRouteToRouteQuote } from "../../../defi/lifi/lifi-normalize.js";
import { requoteLifiFromSnapshot, resolveLifiRouteForExecute } from "../../../defi/lifi/lifi-quote.service.js";

function sumUsd(costs: Array<{ amountUSD?: string }> | undefined): number | null {
  if (!costs || costs.length === 0) {
    return null;
  }
  let total = 0;
  let hasValue = false;
  for (const cost of costs) {
    const parsed = Number.parseFloat(cost.amountUSD ?? "");
    if (Number.isFinite(parsed)) {
      total += parsed;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function resolveRouteFeeUsd(route: Route): number | null {
  let gas: number | null = null;
  let fee: number | null = null;
  for (const step of route.steps) {
    gas = sumUsd(step.estimate?.gasCosts) ?? gas;
    fee = sumUsd(step.estimate?.feeCosts) ?? fee;
  }
  if (gas === null && fee === null) {
    return null;
  }
  return (gas ?? 0) + (fee ?? 0);
}

function readRouteFromParams(params: Record<string, unknown>): Route | null {
  const embedded = params.lifi_route ?? params.route;
  if (embedded && typeof embedded === "object") {
    return embedded as Route;
  }
  return null;
}

function readString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(params: Record<string, unknown>, key: string): number | null {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTokenSymbol(params: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = readString(params, key);
    if (value) {
      if (value.length === 42 && value.slice(0, 2).toLowerCase() === "0x") {
        return value;
      }
      return value.toUpperCase();
    }
  }
  return null;
}

function resolveSnapshotFeeUsd(params: Record<string, unknown>): number | null {
  const combined = readNumber(params, "fee_cost_usd");
  if (combined !== null) {
    return combined;
  }
  const gas = readNumber(params, "gas_cost_usd");
  const fee = readNumber(params, "fee_cost_usd");
  if (gas === null && fee === null) {
    return null;
  }
  return (gas ?? 0) + (fee ?? 0);
}

function resolveAmountDisplayFromAtomic(
  atomic: string | null,
  decimals: number | null,
  symbol: string,
  chainId: string,
  evmChainId: number | null,
): string | null {
  if (!atomic) {
    return null;
  }
  if (decimals !== null) {
    return formatAtomicAmount(atomic, decimals);
  }
  try {
    const tokenInput =
      symbol.length === 42 && symbol.slice(0, 2).toLowerCase() === "0x" && evmChainId !== null
        ? (resolveEvmTokenByAddress(evmChainId, symbol)?.symbol ?? symbol)
        : symbol;
    const resolved = resolveTokenSymbol(
      chainId as ChainId,
      tokenInput,
      chainId === "ethereum" && evmChainId !== null ? evmChainId : undefined,
    );
    if (resolved.match === "exact") {
      return formatAtomicAmount(atomic, resolved.token.decimals);
    }
  } catch {
    // Fall through — caller may still have explicit display amounts.
  }
  return null;
}

/** True when execute params already carry enough metadata for the approval UI. */
export function isLifiApprovalDisplayComplete(params: Record<string, unknown>): boolean {
  const fromSymbol = readTokenSymbol(params, ["from_token_symbol", "from_token"]);
  const toSymbol = readTokenSymbol(params, ["to_token_symbol", "to_token"]);
  const fromAmount = readString(params, "from_amount_display");
  const toAmount = readString(params, "to_amount_display");
  const fromChainId = readString(params, "from_chain_id");
  const toChainId = readString(params, "to_chain_id");
  return Boolean(fromSymbol && toSymbol && fromAmount && toAmount && fromChainId && toChainId);
}

/** Map a prior cross_chain_quote snapshot onto execute params (no Li-Fi route object). */
function enrichFromQuoteSnapshot(params: Record<string, unknown>): Record<string, unknown> | null {
  const fromSymbol = readTokenSymbol(params, ["from_token_symbol", "from_token"]);
  const toSymbol = readTokenSymbol(params, ["to_token_symbol", "to_token"]);
  const fromChainId = readString(params, "from_chain_id");
  const toChainId = readString(params, "to_chain_id");
  if (!fromSymbol || !toSymbol || !fromChainId || !toChainId) {
    return null;
  }

  const fromEvmChainId = readNumber(params, "from_evm_chain_id");
  const toEvmChainId = readNumber(params, "to_evm_chain_id");
  const fromAmountAtomic = readString(params, "from_amount_atomic");
  const toAmountAtomic = readString(params, "to_amount_atomic");

  const displayFromSymbol =
    fromSymbol.length === 42 &&
    fromSymbol.slice(0, 2).toLowerCase() === "0x" &&
    fromEvmChainId !== null
      ? (resolveEvmTokenByAddress(fromEvmChainId, fromSymbol)?.symbol ?? fromSymbol)
      : fromSymbol;
  const displayToSymbol =
    toSymbol.length === 42 &&
    toSymbol.slice(0, 2).toLowerCase() === "0x" &&
    toEvmChainId !== null
      ? (resolveEvmTokenByAddress(toEvmChainId, toSymbol)?.symbol ?? toSymbol)
      : toSymbol;

  const fromAmountDisplay =
    readString(params, "from_amount_display") ??
    resolveAmountDisplayFromAtomic(
      fromAmountAtomic,
      readNumber(params, "from_token_decimals"),
      displayFromSymbol,
      fromChainId,
      fromEvmChainId,
    );
  const toAmountDisplay =
    readString(params, "to_amount_display") ??
    resolveAmountDisplayFromAtomic(
      toAmountAtomic,
      readNumber(params, "to_token_decimals"),
      displayToSymbol,
      toChainId,
      toEvmChainId,
    );

  if (!fromAmountDisplay || !toAmountDisplay) {
    return null;
  }

  const bridges = Array.isArray(params.bridges)
    ? params.bridges.filter((entry): entry is string => typeof entry === "string")
    : readString(params, "tool")
      ? [readString(params, "tool")!]
      : [];

  return {
    ...params,
    from_token_symbol: displayFromSymbol,
    to_token_symbol: displayToSymbol,
    from_amount_display: fromAmountDisplay,
    to_amount_display: toAmountDisplay,
    from_chain_id: fromChainId,
    to_chain_id: toChainId,
    from_evm_chain_id: fromEvmChainId ?? undefined,
    to_evm_chain_id: toEvmChainId ?? undefined,
    bridges,
    fee_cost_usd: resolveSnapshotFeeUsd(params),
    expires_at: readString(params, "expires_at") ?? readString(params, "quote_expires_at"),
    quote_expires_at: readString(params, "quote_expires_at") ?? readString(params, "expires_at"),
    slippage: readNumber(params, "slippage"),
  };
}

export function applyLifiRouteToExecuteParams(
  params: Record<string, unknown>,
  route: Route,
): Record<string, unknown> {
  const firstStep = route.steps[0];
  const lastStep = route.steps.at(-1);
  if (!firstStep || !lastStep) {
    return params;
  }

  const fromRef = lifiToRadiantChainRef(firstStep.action.fromChainId);
  const toRef = lifiToRadiantChainRef(lastStep.action.toChainId);
  const fromSymbol = firstStep.action.fromToken.symbol;
  const toSymbol = lastStep.action.toToken.symbol;

  const normalized = normalizeLifiRouteToRouteQuote({
    route,
    from: fromRef,
    to: toRef,
    fromTokenSymbol: fromSymbol,
    toTokenSymbol: toSymbol,
  });

  return {
    ...params,
    route,
    lifi_route: route,
    from_token_symbol: fromSymbol,
    to_token_symbol: toSymbol,
    from_amount_display: formatAtomicAmount(
      route.fromAmount,
      firstStep.action.fromToken.decimals,
    ),
    to_amount_display: formatAtomicAmount(
      route.toAmount,
      lastStep.action.toToken.decimals,
    ),
    from_chain_id: normalized.from_chain_id,
    to_chain_id: normalized.to_chain_id,
    from_evm_chain_id: fromRef.chain_id === "ethereum" ? fromRef.evm_chain_id : undefined,
    to_evm_chain_id: toRef.chain_id === "ethereum" ? toRef.evm_chain_id : undefined,
    bridges: normalized.bridges,
    fee_cost_usd: resolveRouteFeeUsd(route),
    expires_at: normalized.expires_at,
    quote_expires_at: normalized.expires_at,
    slippage: firstStep.action.slippage,
  };
}

/** Resolve Li-Fi route + display fields for approval UI. */
export async function resolveLifiApprovalParams(
  params: Record<string, unknown>,
  options?: { privyUserId?: string },
): Promise<Record<string, unknown>> {
  const embedded = readRouteFromParams(params);
  if (embedded) {
    return applyLifiRouteToExecuteParams(params, embedded);
  }

  const routeId = readString(params, "route_id");
  if (routeId) {
    try {
      const route = await resolveLifiRouteForExecute({
        routeId,
        route: typeof params.route === "object" ? (params.route as Record<string, unknown>) : undefined,
        lifiRoute:
          typeof params.lifi_route === "object"
            ? (params.lifi_route as Record<string, unknown>)
            : undefined,
      });
      return applyLifiRouteToExecuteParams(params, route);
    } catch {
      if (options?.privyUserId) {
        const requoted = await requoteLifiFromSnapshot(options.privyUserId, params);
        const refreshedRoute = requoted?.lifi_route;
        if (requoted && refreshedRoute) {
          return applyLifiRouteToExecuteParams(
            {
              ...params,
              route_id: requoted.route_id,
              from_token_symbol: requoted.from_token_symbol,
              to_token_symbol: requoted.to_token_symbol,
              from_token: requoted.from_token,
              to_token: requoted.to_token,
              from_amount_atomic: requoted.from_amount_atomic,
              to_amount_atomic: requoted.to_amount_atomic,
              from_chain_id: requoted.from_chain_id,
              to_chain_id: requoted.to_chain_id,
              from_evm_chain_id: requoted.from_evm_chain_id,
              to_evm_chain_id: requoted.to_evm_chain_id,
              bridges: requoted.bridges,
              fee_cost_usd: requoted.fee_cost_usd,
              expires_at: requoted.expires_at,
            },
            refreshedRoute,
          );
        }
      }
      // Fall through to quote snapshot fields from cross_chain_quote.
    }
  }

  const snapshot = enrichFromQuoteSnapshot(params);
  if (snapshot) {
    return snapshot;
  }

  return params;
}
