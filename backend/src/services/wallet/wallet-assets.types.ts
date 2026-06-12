import type { ChainId } from "../chains/types.js";

export type WalletAssetRow = {
  symbol: string;
  name: string;
  coin_type: string;
  balance_atomic: string;
  balance_display: number;
  decimals: number;
  usd_value: number | null;
  source: "sui_rpc";
  popular: boolean;
};

export type WalletAssetsData = {
  chain_id: ChainId;
  address: string;
  total_usd: number | null;
  assets: WalletAssetRow[];
  catalog_source: "indexer" | "fallback";
  updated_at: string;
};
