import type { Route } from "@lifi/types";
import type { ChainId } from "../../chains/types.js";
import type { DeFiProviderId } from "../types.js";
import type { SquidRouteSnapshot } from "../squid/squid.types.js";

export type CrossChainFallbackStatus = "offered" | "accepted" | "rejected" | "expired";

export type CrossChainProviderId = Extract<DeFiProviderId, "evm-lifi" | "evm-squid">;

export type LifiProviderPayload = {
  kind: "lifi";
  lifi_route: Route;
  from_lifi_chain_id: number;
  to_lifi_chain_id: number;
};

export type SquidProviderPayload = {
  kind: "squid";
  squid_route: SquidRouteSnapshot;
  quote_id: string;
  request_id?: string;
  from_squid_chain_id: string;
  to_squid_chain_id: string;
};

export type CrossChainProviderPayload = LifiProviderPayload | SquidProviderPayload;

/** Provider-agnostic cross-chain route option for Li-Fi primary + Squid fallback orchestration. */
export type CrossChainRouteOption = {
  route_id: string;
  provider_id: CrossChainProviderId;
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  from_token_symbol: string;
  to_token_symbol: string;
  from_amount_atomic: string;
  to_amount_atomic: string;
  bridges: string[];
  exchanges: string[];
  estimated_duration_seconds: number | null;
  gas_cost_usd: number | null;
  fee_cost_usd: number | null;
  tags: string[];
  expires_at: string;
  provider_payload: CrossChainProviderPayload;
};

export type CrossChainRoutesResult = {
  routes: CrossChainRouteOption[];
  unavailable_routes: unknown;
};

/** Snapshot offered when Li-Fi has no liquidity and user may opt into Squid. */
export type LiquidityFallbackOffer = {
  fallback_offer_id: string;
  status: CrossChainFallbackStatus;
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  from_token: string;
  to_token: string;
  amount_atomic: string;
  slippage?: number;
  confirm_same_token?: boolean;
  offered_at: string;
  expires_at: string;
  /** Original Li-Fi error code when available (e.g. LIFI_NO_ROUTE). */
  primary_error_code?: string;
};
