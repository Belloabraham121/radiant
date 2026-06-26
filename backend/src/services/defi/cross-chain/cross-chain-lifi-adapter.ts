import type { CrossChainRouteOption as LifiCrossChainRouteOption } from "../lifi/lifi.types.js";
import type { CrossChainRouteOption } from "./cross-chain.types.js";

export const LIFI_ROUTE_ID_PREFIX = "lifi:";

export function toLifiPrefixedRouteId(routeId: string): string {
  return routeId.startsWith(LIFI_ROUTE_ID_PREFIX) ? routeId : `${LIFI_ROUTE_ID_PREFIX}${routeId}`;
}

export function stripLifiRouteIdPrefix(routeId: string): string {
  return routeId.startsWith(LIFI_ROUTE_ID_PREFIX) ? routeId.slice(LIFI_ROUTE_ID_PREFIX.length) : routeId;
}

export function mapLifiRouteToCrossChainOption(route: LifiCrossChainRouteOption): CrossChainRouteOption {
  return {
    route_id: toLifiPrefixedRouteId(route.route_id),
    provider_id: "evm-lifi",
    from_chain_id: route.from_chain_id,
    to_chain_id: route.to_chain_id,
    from_evm_chain_id: route.from_evm_chain_id,
    to_evm_chain_id: route.to_evm_chain_id,
    from_token_symbol: route.from_token_symbol,
    to_token_symbol: route.to_token_symbol,
    from_amount_atomic: route.from_amount_atomic,
    to_amount_atomic: route.to_amount_atomic,
    bridges: route.bridges,
    exchanges: route.exchanges,
    estimated_duration_seconds: route.estimated_duration_seconds,
    gas_cost_usd: route.gas_cost_usd,
    fee_cost_usd: route.fee_cost_usd,
    tags: route.tags,
    expires_at: route.expires_at,
    provider_payload: {
      kind: "lifi",
      lifi_route: route.lifi_route,
      from_lifi_chain_id: route.from_lifi_chain_id,
      to_lifi_chain_id: route.to_lifi_chain_id,
    },
  };
}
