import { resolveTokenSymbol, resolveEvmTokenByAddress } from "../../../../config/supported-tokens.js";
import type { ChainId } from "../../../chains/types.js";
import { formatAtomicAmount } from "../../../defi/squid/squid-chain-map.js";
import { coalesceDeFiQuoteExpiresAt } from "../quote-expiry.js";
import { isExecutableSquidRoute } from "../../../defi/squid/squid-normalize.js";
import {
  requoteSquidFromSnapshot,
  resolveSquidRouteForExecute,
} from "../../../defi/squid/squid-quote.service.js";
import type { SquidRouteSnapshot } from "../../../defi/squid/squid.types.js";

type SquidCost = { amountUsd?: string | number; amountUSD?: string | number };

function sumUsd(costs: SquidCost[] | undefined): number | null {
  if (!costs || costs.length === 0) {
    return null;
  }
  let total = 0;
  let hasValue = false;
  for (const cost of costs) {
    const raw = cost.amountUsd ?? cost.amountUSD;
    const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
    if (Number.isFinite(parsed)) {
      total += parsed;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function resolveRouteFeeUsd(route: SquidRouteSnapshot): number | null {
  const estimate = route.estimate;
  const gas = sumUsd(estimate?.gasCosts as SquidCost[] | undefined);
  const fee = sumUsd(estimate?.feeCosts as SquidCost[] | undefined);
  if (gas === null && fee === null) {
    return null;
  }
  return (gas ?? 0) + (fee ?? 0);
}

function readRouteFromParams(params: Record<string, unknown>): SquidRouteSnapshot | null {
  const embedded = params.squid_route;
  return isExecutableSquidRoute(embedded) ? embedded : null;
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
export function isSquidApprovalDisplayComplete(params: Record<string, unknown>): boolean {
  const fromSymbol = readTokenSymbol(params, ["from_token_symbol", "from_token"]);
  const toSymbol = readTokenSymbol(params, ["to_token_symbol", "to_token"]);
  const fromAmount = readString(params, "from_amount_display");
  const toAmount = readString(params, "to_amount_display");
  const fromChainId = readString(params, "from_chain_id");
  const toChainId = readString(params, "to_chain_id");
  return Boolean(fromSymbol && toSymbol && fromAmount && toAmount && fromChainId && toChainId);
}

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
    return {
      ...params,
      provider_id: "evm-squid",
      from_token_symbol: displayFromSymbol,
      to_token_symbol: displayToSymbol,
      from_chain_id: fromChainId,
      to_chain_id: toChainId,
      from_evm_chain_id: fromEvmChainId ?? undefined,
      to_evm_chain_id: toEvmChainId ?? undefined,
    };
  }

  const bridges = Array.isArray(params.bridges)
    ? params.bridges.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    ...params,
    provider_id: "evm-squid",
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
    expires_at: coalesceDeFiQuoteExpiresAt(
      readString(params, "expires_at") ?? readString(params, "quote_expires_at"),
    ),
    quote_expires_at: coalesceDeFiQuoteExpiresAt(
      readString(params, "quote_expires_at") ?? readString(params, "expires_at"),
    ),
    slippage: readNumber(params, "slippage"),
  };
}

export function applySquidRouteToExecuteParams(
  params: Record<string, unknown>,
  route: SquidRouteSnapshot,
  snapshot?: {
    from_chain_id?: ChainId;
    to_chain_id?: ChainId;
    from_evm_chain_id?: number;
    to_evm_chain_id?: number;
    from_token_symbol?: string;
    to_token_symbol?: string;
    bridges?: string[];
  },
): Record<string, unknown> {
  const estimate = route.estimate;
  const fromAmountAtomic = estimate?.fromAmount ?? route.params?.fromAmount ?? "0";
  const toAmountAtomic = estimate?.toAmount ?? estimate?.toAmountMin ?? "0";
  const fromSymbol =
    snapshot?.from_token_symbol ??
    readTokenSymbol(params, ["from_token_symbol", "from_token"]) ??
    "token";
  const toSymbol =
    snapshot?.to_token_symbol ??
    readTokenSymbol(params, ["to_token_symbol", "to_token"]) ??
    "token";
  const fromChainId = snapshot?.from_chain_id ?? readString(params, "from_chain_id") ?? "ethereum";
  const toChainId = snapshot?.to_chain_id ?? readString(params, "to_chain_id") ?? "ethereum";
  const fromEvmChainId = snapshot?.from_evm_chain_id ?? readNumber(params, "from_evm_chain_id");
  const toEvmChainId = snapshot?.to_evm_chain_id ?? readNumber(params, "to_evm_chain_id");

  const fromAmountDisplay =
    readString(params, "from_amount_display") ??
    resolveAmountDisplayFromAtomic(
      fromAmountAtomic,
      readNumber(params, "from_token_decimals"),
      fromSymbol,
      fromChainId,
      fromEvmChainId,
    ) ??
    fromAmountAtomic;
  const toAmountDisplay =
    readString(params, "to_amount_display") ??
    resolveAmountDisplayFromAtomic(
      toAmountAtomic,
      readNumber(params, "to_token_decimals"),
      toSymbol,
      toChainId,
      toEvmChainId,
    ) ??
    toAmountAtomic;

  const bridges =
    snapshot?.bridges ??
    (Array.isArray(params.bridges)
      ? params.bridges.filter((entry): entry is string => typeof entry === "string")
      : []);

  const expiresAt = coalesceDeFiQuoteExpiresAt(
    readString(params, "expires_at") ?? readString(params, "quote_expires_at"),
  );

  return {
    ...params,
    provider_id: "evm-squid",
    squid_route: route,
    from_token_symbol: fromSymbol,
    to_token_symbol: toSymbol,
    from_amount_atomic: fromAmountAtomic,
    to_amount_atomic: toAmountAtomic,
    from_amount_display: fromAmountDisplay,
    to_amount_display: toAmountDisplay,
    from_chain_id: fromChainId,
    to_chain_id: toChainId,
    from_evm_chain_id: fromEvmChainId ?? undefined,
    to_evm_chain_id: toEvmChainId ?? undefined,
    bridges,
    fee_cost_usd: resolveRouteFeeUsd(route) ?? resolveSnapshotFeeUsd(params),
    ...(expiresAt ? { expires_at: expiresAt, quote_expires_at: expiresAt } : {}),
    slippage: readNumber(params, "slippage"),
  };
}

/** Resolve Squid route + display fields for approval UI. */
export async function resolveSquidApprovalParams(
  params: Record<string, unknown>,
  options?: { privyUserId?: string; requoteOnCacheMiss?: boolean },
): Promise<Record<string, unknown>> {
  const embedded = readRouteFromParams(params);
  if (embedded) {
    return applySquidRouteToExecuteParams(params, embedded);
  }

  const requoteOnCacheMiss = options?.requoteOnCacheMiss ?? Boolean(options?.privyUserId);
  const routeId = readString(params, "route_id");

  if (routeId) {
    try {
      const stored = await resolveSquidRouteForExecute({
        routeId,
        squidRoute:
          typeof params.squid_route === "object"
            ? (params.squid_route as Record<string, unknown>)
            : undefined,
        privyUserId: options?.privyUserId,
        snapshotParams: params,
      });
      return applySquidRouteToExecuteParams(params, stored.route, {
        from_chain_id: stored.from_chain_id,
        to_chain_id: stored.to_chain_id,
        from_evm_chain_id: stored.from_evm_chain_id,
        to_evm_chain_id: stored.to_evm_chain_id,
      });
    } catch {
      if (requoteOnCacheMiss && options?.privyUserId) {
        const requoted = await requoteSquidFromSnapshot(options.privyUserId, params);
        if (requoted?.provider_payload.kind === "squid") {
          return applySquidRouteToExecuteParams(
            {
              ...params,
              route_id: requoted.route_id,
              from_token_symbol: requoted.from_token_symbol,
              to_token_symbol: requoted.to_token_symbol,
              from_token: requoted.from_token_symbol,
              to_token: requoted.to_token_symbol,
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
            requoted.provider_payload.squid_route,
            {
              from_chain_id: requoted.from_chain_id,
              to_chain_id: requoted.to_chain_id,
              from_evm_chain_id: requoted.from_evm_chain_id,
              to_evm_chain_id: requoted.to_evm_chain_id,
              from_token_symbol: requoted.from_token_symbol,
              to_token_symbol: requoted.to_token_symbol,
              bridges: requoted.bridges,
            },
          );
        }
      }
    }
  }

  const snapshot = enrichFromQuoteSnapshot(params);
  if (snapshot) {
    return snapshot;
  }

  return { ...params, provider_id: "evm-squid" };
}
