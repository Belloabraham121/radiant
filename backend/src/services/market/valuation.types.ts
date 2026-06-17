import type { ChainId } from "../chains/types.js";

export type FiatPriceSource = "coingecko" | "stablecoin_peg" | "pool_mid" | "unknown";

export type ValuationLeg = {
  role: "pay" | "receive" | "fee";
  amount_display: number;
  symbol: string;
  usd_price: number | null;
  usd_value: number | null;
  price_source: FiatPriceSource;
};

export type TransactionFiatPreview = {
  legs: ValuationLeg[];
  total_pay_usd: number | null;
  total_receive_usd: number | null;
  net_usd: number | null;
  priced_at: string | null;
};

export type SymbolAmount = {
  amount_display: number;
  symbol: string;
};

export type SwapFiatInput = {
  chain_id: ChainId;
  pay: SymbolAmount;
  receive: SymbolAmount;
  fee?: SymbolAmount;
  /** Quote price: quote per base (DeepBook pool convention). */
  pool_price?: number | null;
  base_symbol?: string;
  quote_symbol?: string;
};
