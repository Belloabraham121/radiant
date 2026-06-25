export type DeFiApprovalPreviewKind = "swap" | "bridge" | "transfer" | "generic" | "lifi_continue";

export type DeFiApprovalAssetLine = {
  symbol: string;
  amount_display: string;
  chain_label?: string;
};

export type DeFiApprovalPreview = {
  kind: DeFiApprovalPreviewKind;
  provider_id?: "sui-deepbook" | "evm-lifi" | "evm-sushiswap" | "stellar-soroswap";
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
};
