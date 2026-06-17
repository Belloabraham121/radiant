import type { ChainId } from "../chains/types.js";

export type WalletAssetsQuery = {
  chain_id: ChainId;
  evm_chain_id?: number;
  include_zero?: boolean;
  include_usd?: boolean;
};

export type WalletAssetRow = {
  symbol: string;
  name: string;
  coin_type: string;
  balance_atomic: string;
  balance_display: number;
  decimals: number;
  usd_value: number | null;
  usd_price?: number | null;
  logo_url?: string | null;
  source: "sui_rpc" | "privy";
  popular: boolean;
};

export type WalletAssetsData = {
  chain_id: ChainId;
  address: string;
  evm_chain_id?: number;
  total_usd: number | null;
  assets: WalletAssetRow[];
  catalog_source: "indexer" | "fallback" | "privy";
  updated_at: string;
  prices_updated_at?: string | null;
};
