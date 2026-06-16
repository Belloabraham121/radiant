export type MarginIndexerEventBase = {
  event_digest: string;
  digest: string;
  sender: string;
  checkpoint: number;
  checkpoint_timestamp_ms: number;
  package: string;
  onchain_timestamp: number;
};

export type MarginIndexerLiquidationRecord = MarginIndexerEventBase & {
  margin_manager_id: string;
  margin_pool_id: string;
  liquidation_amount: number;
  pool_reward: number;
  pool_default: number;
  risk_ratio: number;
  remaining_base_asset?: string;
  remaining_quote_asset?: string;
  remaining_base_debt?: string;
  remaining_quote_debt?: string;
};

export type MarginIndexerCollateralRecord = MarginIndexerEventBase & {
  event_type: "Deposit" | "Withdraw" | string;
  margin_manager_id: string;
  amount: string;
  asset_type: string;
  remaining_base_asset?: string;
  remaining_quote_asset?: string;
  remaining_base_debt?: string;
  remaining_quote_debt?: string;
};

export type MarginIndexerLoanBorrowedRecord = MarginIndexerEventBase & {
  margin_manager_id: string;
  margin_pool_id: string;
  loan_amount: number;
  loan_shares: number;
};

export type MarginIndexerLoanRepaidRecord = MarginIndexerEventBase & {
  margin_manager_id: string;
  margin_pool_id: string;
  repay_amount: number;
  repay_shares: number;
};

export type MarginIndexerManagerStateRecord = {
  id: number;
  margin_manager_id: string;
  deepbook_pool_id: string;
  base_margin_pool_id: string;
  quote_margin_pool_id: string;
  base_asset_id: string;
  base_asset_symbol: string;
  quote_asset_id: string;
  quote_asset_symbol: string;
  risk_ratio: string;
  base_asset: string;
  quote_asset: string;
  base_debt: string;
  quote_debt: string;
  current_price?: string;
  lowest_trigger_above_price?: string | null;
  highest_trigger_below_price?: string | null;
  updated_at?: string;
};

export type MarginIndexerManagersInfoRecord = {
  margin_manager_id: string;
  deepbook_pool_id: string;
  base_asset_symbol: string;
  quote_asset_symbol: string;
  base_margin_pool_id: string;
  quote_margin_pool_id: string;
};

export type MarginIndexerManagerCreatedRecord = MarginIndexerEventBase & {
  margin_manager_id: string;
  balance_manager_id: string;
  deepbook_pool_id: string;
  owner: string;
};

export type MarginIndexerAssetSuppliedRecord = MarginIndexerEventBase & {
  margin_pool_id: string;
  asset_type: string;
  supplier: string;
  amount: number;
  shares: number;
};

export type MarginIndexerAssetWithdrawnRecord = MarginIndexerEventBase & {
  margin_pool_id: string;
  asset_type: string;
  supplier: string;
  amount: number;
  shares: number;
};

export type MarginIndexerSupplySnapshotRecord = {
  margin_pool_id: string;
  asset_type: string;
  asset_symbol?: string;
  total_supply?: number | string;
  total_shares?: number | string;
};

export type MarginIndexerQueryOptions = {
  start_time?: number;
  end_time?: number;
  limit?: number;
  margin_manager_id?: string;
  margin_pool_id?: string;
  deepbook_pool_id?: string;
  max_risk_ratio?: number;
  supplier?: string;
  type?: "Deposit" | "Withdraw";
  is_base?: boolean;
};
