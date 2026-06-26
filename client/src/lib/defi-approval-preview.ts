export type DeFiApprovalPreviewKind = "swap" | "bridge" | "transfer" | "generic" | "lifi_continue";

export type DeFiApprovalAssetLine = {
  symbol: string;
  amount_display: string;
  chain_label?: string;
};

export type DeFiApprovalPreview = {
  kind: DeFiApprovalPreviewKind;
  provider_id?:
    | "sui-deepbook"
    | "evm-lifi"
    | "evm-squid"
    | "evm-sushiswap"
    | "stellar-soroswap";
  title: string;
  amount_display: string;
  pay?: DeFiApprovalAssetLine;
  receive?: DeFiApprovalAssetLine;
  route_summary?: string;
  bridges?: string[];
  fee_cost_usd?: number | null;
  quote_expires_at?: string | null;
  slippage?: number | null;
  fiat_preview?: import("@/lib/chat-api").TransactionFiatPreview | null;
  /** True when the route was found via liquidity fallback (not primary Li-Fi). */
  alternate_route?: boolean;
  route_provider_label?: string;
};
