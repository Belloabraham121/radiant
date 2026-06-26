import type { Route } from "@lifi/types";
import { z } from "zod";
import type { ChainId } from "../../chains/types.js";
import type { DeFiProviderId } from "../types.js";
import type { SquidRouteSnapshot, SquidStoredRoutePayload } from "../squid/squid.types.js";

const evmChainIdSchema = z.coerce.number().int().positive();
const crossChainRadiantChainIdSchema = z.enum(["sui", "solana", "ethereum"]);

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
  liquidity_fallback_offer?: LiquidityFallbackOffer;
  routing?: { primary: CrossChainProviderId; fallback?: CrossChainProviderId };
};

/** Quote params snapshotted when Li-Fi has no liquidity (used for Squid on user accept). */
export type CrossChainFallbackQuoteParams = {
  from_chain_id?: ChainId;
  to_chain_id?: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  from_token?: string;
  to_token?: string;
  amount_atomic?: string;
  slippage?: number;
  confirm_same_token?: boolean;
  max_routes?: number;
};

export type ResolvedCrossChainRoute =
  | { provider_id: "evm-lifi"; route: Route }
  | { provider_id: "evm-squid"; payload: SquidStoredRoutePayload };

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

/** Redis payload — includes ownership and quote snapshot (not returned to clients). */
export type StoredLiquidityFallbackOffer = LiquidityFallbackOffer & {
  privyUserId: string;
  quoteParams: CrossChainFallbackQuoteParams;
};

/** Returned by cross_chain_quote when Li-Fi has no liquidity but Squid fallback is offered. */
export type CrossChainQuoteFallbackResult = {
  liquidity_fallback_offer: LiquidityFallbackOffer;
  unavailable_routes: unknown;
  routing?: CrossChainRoutesResult["routing"];
};

export const crossChainStatusInputSchema = z.object({
  provider_id: z.enum(["evm-lifi", "evm-squid"]).optional(),
  tx_hash: z.string().min(8).optional(),
  transaction_id: z.string().min(8).optional(),
  quote_id: z.string().min(1).optional(),
  from_chain_id: crossChainRadiantChainIdSchema.optional(),
  to_chain_id: crossChainRadiantChainIdSchema.optional(),
  from_evm_chain_id: evmChainIdSchema.optional(),
  to_evm_chain_id: evmChainIdSchema.optional(),
  bridge: z.string().min(1).optional(),
  request_id: z.string().min(1).optional(),
  bridge_type: z.string().min(1).optional(),
  route_id: z.string().min(1).optional(),
});
export type CrossChainStatusInput = z.infer<typeof crossChainStatusInputSchema>;
