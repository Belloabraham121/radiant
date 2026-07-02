export type PolymarketBookLevel = {
  price: number;
  size: number;
};

export type PolymarketBookSnapshot = {
  asset_id: string;
  bids: PolymarketBookLevel[];
  asks: PolymarketBookLevel[];
  best_bid: number | null;
  best_ask: number | null;
  mid: number | null;
  spread: number | null;
  updated_at: string;
};

export type PolymarketPriceQuote = {
  asset_id: string;
  price: number | null;
  midpoint: number | null;
  updated_at: string;
};

export type PolymarketWsMarketMessage = {
  event_type?: string;
  asset_id?: string;
  market?: string;
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
  price?: string;
  size?: string;
  side?: string;
};
