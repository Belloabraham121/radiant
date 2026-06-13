export type IndexerAssetRecord = {
  name: string;
  asset_type: string;
  contractAddress: string;
  can_deposit?: string;
  can_withdraw?: string;
};

export type TokenCatalogEntry = {
  symbol: string;
  name: string;
  coin_type: string;
  decimals: number;
  popular: boolean;
};
