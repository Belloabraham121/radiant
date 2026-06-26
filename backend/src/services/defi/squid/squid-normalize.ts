import { createHash } from "node:crypto";
import type { SquidChainRef } from "../../../config/squid-chains.js";
import {
  radiantChainRefToSquidChainId,
  squidChainRefLabel,
} from "../../../config/squid-chains.js";
import type { CrossChainRouteOption } from "../cross-chain/cross-chain.types.js";
import type { RouteStep } from "../types.js";
import { squidToRadiantChainRef } from "./squid-chain-map.js";
import type { SquidRouteResponse, SquidRouteSnapshot } from "./squid.types.js";

/** Squid quotes are short-lived — align approval countdown with Li-Fi (~60s). */
export const SQUID_QUOTE_TTL_MS = 60_000;

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

function extractSquidBridges(route: SquidRouteSnapshot): string[] {
  const bridges = new Set<string>();
  const actions = route.estimate?.actions;
  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (action && typeof action === "object") {
        const record = action as Record<string, unknown>;
        const provider = record.provider ?? record.type ?? record.action;
        if (typeof provider === "string" && provider.trim()) {
          bridges.add(provider);
        }
      }
    }
  }
  return [...bridges];
}

function normalizeSquidRouteSteps(
  route: SquidRouteSnapshot,
  from: SquidChainRef,
  to: SquidChainRef,
  fromTokenSymbol: string,
  toTokenSymbol: string,
): RouteStep[] {
  const bridges = extractSquidBridges(route);
  const tool = bridges[0];
  return [
    {
      type: "bridge",
      provider: "evm-squid",
      from_chain: squidChainRefLabel(from),
      to_chain: squidChainRefLabel(to),
      from_token: fromTokenSymbol,
      to_token: toTokenSymbol,
      tool,
    },
  ];
}

function quoteExpiresAt(): string {
  return new Date(Date.now() + SQUID_QUOTE_TTL_MS).toISOString();
}

export function createSquidRouteId(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `squid:${hash}`;
}

function chainRefFields(from: SquidChainRef, to: SquidChainRef) {
  return {
    from_chain_id: from.chain_id,
    to_chain_id: to.chain_id,
    from_evm_chain_id: from.chain_id === "ethereum" ? from.evm_chain_id : undefined,
    to_evm_chain_id: to.chain_id === "ethereum" ? to.evm_chain_id : undefined,
  };
}

export function normalizeSquidRouteOption(input: {
  response: SquidRouteResponse;
  from: SquidChainRef;
  to: SquidChainRef;
  fromTokenSymbol: string;
  toTokenSymbol: string;
  routeId?: string;
}): CrossChainRouteOption {
  const route = input.response.route;
  const estimate = route.estimate;
  const fromAmount = estimate?.fromAmount ?? route.params?.fromAmount ?? "0";
  const toAmount = estimate?.toAmount ?? estimate?.toAmountMin ?? "0";
  const seed = JSON.stringify({
    from: radiantChainRefToSquidChainId(input.from),
    to: radiantChainRefToSquidChainId(input.to),
    fromAmount,
    toAmount,
    quoteId: route.quoteId,
  });
  const routeId = input.routeId ?? createSquidRouteId(seed);
  const bridges = extractSquidBridges(route);
  const exchanges = new Set<string>();

  return {
    route_id: routeId,
    provider_id: "evm-squid",
    ...chainRefFields(input.from, input.to),
    from_token_symbol: input.fromTokenSymbol,
    to_token_symbol: input.toTokenSymbol,
    from_amount_atomic: fromAmount,
    to_amount_atomic: toAmount,
    bridges,
    exchanges: [...exchanges],
    estimated_duration_seconds: estimate?.estimatedRouteDuration ?? null,
    gas_cost_usd: sumUsd(estimate?.gasCosts as SquidCost[] | undefined),
    fee_cost_usd: sumUsd(estimate?.feeCosts as SquidCost[] | undefined),
    tags: [],
    expires_at: quoteExpiresAt(),
    provider_payload: {
      kind: "squid",
      squid_route: route,
      quote_id: route.quoteId,
      request_id: input.response.requestId,
      from_squid_chain_id: radiantChainRefToSquidChainId(input.from),
      to_squid_chain_id: radiantChainRefToSquidChainId(input.to),
    },
  };
}

/** Resolve Squid chain id from route params for status/tracking helpers. */
export function squidChainIdFromRouteParam(chainId: string | number): SquidChainRef {
  return squidToRadiantChainRef(String(chainId));
}

export { normalizeSquidRouteSteps };
