export type {
  DeFiProviderId,
  SwapQuote,
  SwapSide,
  RouteQuote,
  RouteStep,
  RouteStepType,
} from "../types.js";

/** Pool metadata for agent/UI reads (Phase C). */
export type PoolSummary = {
  pool_key: string;
  base_coin: string;
  quote_coin: string;
  last_price: number | null;
  volume_24h: number | null;
};

/** Open or historical order row (Phase E). */
export type OrderSummary = {
  order_id: string;
  pool_key: string;
  client_order_id: string;
  price: number;
  quantity: number;
  remaining_quantity: number;
  is_bid: boolean;
  status: "open" | "filled" | "cancelled";
};

/** Staked DEEP position in a pool (Phase G). */
export type StakeSummary = {
  pool_key: string;
  staked_amount: number;
  reward_amount: number | null;
};

/** Balance manager registered with the DeepBook client extension. */
export type DeepBookBalanceManagerConfig = {
  address: string;
  tradeCap?: string;
  depositCap?: string;
  withdrawCap?: string;
};

/** Inputs for constructing a per-wallet DeepBook client. */
export type DeepBookClientContext = {
  address: string;
  balanceManagers?: Record<string, DeepBookBalanceManagerConfig>;
};
