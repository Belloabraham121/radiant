import type { ChainId } from "../../chains/types.js";
import type { SoroswapTradeType } from "../soroswap/soroswap.types.js";
import type { SoroswapQuoteResult } from "../soroswap/soroswap-quote.service.js";

export type StellarRoutingFallbackStatus = "offered" | "accepted" | "rejected" | "expired";

/** Quote params snapshotted when wrong-chain swap may route via Stellar. */
export type StellarRoutingFallbackQuoteParams = {
  token_in: string;
  token_out: string;
  amount: string;
  trade_type?: SoroswapTradeType;
  slippage?: number;
  from_address?: string;
};

/** Snapshot offered when tokens are Stellar-only but user selected another chain. */
export type StellarRoutingFallbackOffer = {
  fallback_offer_id: string;
  status: StellarRoutingFallbackStatus;
  selected_chain_id: ChainId;
  selected_evm_chain_id?: number;
  token_in: string;
  token_out: string;
  amount: string;
  trade_type?: SoroswapTradeType;
  slippage?: number;
  offered_at: string;
  expires_at: string;
  /** Original routing error code when available. */
  primary_error_code?: string;
};

/** Redis payload — includes ownership and quote snapshot (not returned to clients). */
export type StoredStellarRoutingFallbackOffer = StellarRoutingFallbackOffer & {
  privyUserId: string;
  quoteParams: StellarRoutingFallbackQuoteParams;
};

export type StellarRoutingFallbackIntent = {
  token_in: string;
  token_out: string;
  amount: string;
  chain_id: ChainId;
  evm_chain_id?: number;
  trade_type?: SoroswapTradeType;
  slippage?: number;
  from_address?: string;
};

export type StellarRoutingFallbackQuoteResult = SoroswapQuoteResult & {
  routing?: { primary: "stellar-soroswap" };
};
