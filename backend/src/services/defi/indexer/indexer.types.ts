export type IndexerPoolRecord = {
  pool_id: string;
  pool_name: string;
  base_asset_id: string;
  base_asset_decimals: number;
  base_asset_symbol: string;
  base_asset_name: string;
  quote_asset_id: string;
  quote_asset_decimals: number;
  quote_asset_symbol: string;
  quote_asset_name: string;
  min_size: number;
  lot_size: number;
  tick_size: number;
};

export type IndexerTickerRecord = {
  last_price: number;
  isFrozen: number;
  quote_volume: number;
  base_volume: number;
};

export type IndexerTickerResponse = Record<string, IndexerTickerRecord>;

export type IndexerSummaryRecord = {
  base_currency: string;
  quote_currency: string;
  last_price: number;
  lowest_price_24h: number;
  highest_price_24h: number;
  price_change_percent_24h: number;
  base_volume: number;
  quote_volume: number;
  highest_bid: number;
  lowest_ask: number;
};

export type IndexerSummaryResponse = Record<string, IndexerSummaryRecord>;

export type IndexerOrderbookLevel = [number, number];

export type IndexerOrderbookResponse = {
  bids: IndexerOrderbookLevel[];
  asks: IndexerOrderbookLevel[];
};

export type IndexerAssetRecord = {
  name: string;
  asset_type: string;
  contractAddress: string;
  can_deposit?: string;
  can_withdraw?: string;
};

export type IndexerAssetsResponse = Record<string, IndexerAssetRecord>;
