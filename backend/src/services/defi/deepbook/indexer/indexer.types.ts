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

export type IndexerOrderRecord = {
  order_id: string;
  balance_manager_id: string;
  type: string;
  current_status: string;
  price: number;
  placed_at: number;
  last_updated_at: number;
  original_quantity: number;
  filled_quantity: number;
  remaining_quantity: number;
};

export type IndexerOrderUpdateRecord = {
  order_id: string;
  balance_manager_id: string;
  type: string;
  status: string;
  price: number;
  quantity: number;
  timestamp: number;
};

export type IndexerTradeRecord = {
  trade_id: string;
  price: number;
  type: string;
  digest: string;
  timestamp: number;
  base_volume: number;
  quote_volume: number;
  taker_is_bid: boolean;
  maker_balance_manager_id: string;
  taker_balance_manager_id: string;
  maker_order_id: string;
  taker_order_id: string;
  maker_fee: number;
  taker_fee: number;
  maker_fee_is_deep: boolean;
  taker_fee_is_deep: boolean;
};

export type IndexerOhlcvResponse = {
  candles: Array<[number, number, number, number, number, number]>;
};

export type IndexerHistoricalVolumeResponse = Record<string, number>;

export type IndexerPipelineStatus = {
  pipeline: string;
  indexed_checkpoint: number;
  indexed_epoch: number;
  indexed_timestamp_ms: number;
  checkpoint_lag: number;
  time_lag_seconds: number;
  latest_onchain_checkpoint: number;
  is_backfill: boolean;
};

export type IndexerStatusResponse = {
  status: string;
  latest_onchain_checkpoint: number;
  current_time_ms: number;
  earliest_checkpoint: number;
  max_lag_pipeline: string;
  pipelines: IndexerPipelineStatus[];
};
