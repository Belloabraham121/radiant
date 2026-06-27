/** Registered onchain DeFi venue. */
export type DeFiProviderId =
  | "sui-deepbook"
  | "evm-lifi"
  | "evm-squid"
  | "evm-sushiswap"
  | "stellar-soroswap";

export type SwapSide = "buy" | "sell";

/** Quote for a single-chain swap. */
export type SwapQuote = {
  provider_id: DeFiProviderId;
  pool_key: string;
  input_coin: string;
  output_coin: string;
  input_amount_atomic: string;
  output_amount_atomic: string;
  input_amount_display: number;
  output_amount_display: number;
  price: number | null;
  fee_deep: number | null;
  expires_at: string | null;
  /** Soroswap quote id (Stellar same-chain swaps). */
  quote_id?: string;
  /** Internal route id, e.g. `soroswap:{quoteId}`. */
  route_id?: string;
  /** Full provider quote blob for build/execute. */
  provider_payload?: Record<string, unknown>;
};

/** Stellar same-chain swap quote from Soroswap. */
export type StellarSwapQuote = SwapQuote & {
  provider_id: "stellar-soroswap";
  quote_id: string;
};

export type RouteStepType = "swap" | "bridge" | "approve";

/** One leg in a cross-chain route (Li-Fi). */
export type RouteStep = {
  type: RouteStepType;
  provider: string;
  from_chain: string;
  to_chain: string;
  from_token: string;
  to_token: string;
  tool?: string;
};

/** Cross-chain bridge / multi-hop quote. */
export type RouteQuote = {
  provider_id: DeFiProviderId;
  from_chain_id: string;
  to_chain_id: string;
  from_token: string;
  to_token: string;
  from_amount_atomic: string;
  to_amount_atomic: string;
  steps: RouteStep[];
  bridges: string[];
  estimated_duration_seconds: number | null;
  expires_at: string | null;
};
