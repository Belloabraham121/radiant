export type PrivyNamedAsset = "usdc" | "eth" | "pol" | "usdt" | "sol";

export type PrivyChain =
  | "ethereum"
  | "arbitrum"
  | "base"
  | "linea"
  | "optimism"
  | "polygon"
  | "solana"
  | "zksync_era"
  | "sepolia"
  | "arbitrum_sepolia"
  | "base_sepolia"
  | "linea_testnet"
  | "optimism_sepolia"
  | "polygon_amoy"
  | "solana_devnet"
  | "solana_testnet";

export type PrivyBalanceGetParams = {
  asset: PrivyNamedAsset | PrivyNamedAsset[];
  chain: PrivyChain | PrivyChain[];
  include_currency?: "usd";
};

export type PrivyBalanceRow = {
  asset: PrivyNamedAsset;
  chain: PrivyChain;
  raw_value: string;
  raw_value_decimals: number;
  display_values: Record<string, string>;
};

export type PrivyBalanceGetResponse = {
  balances: PrivyBalanceRow[];
};
