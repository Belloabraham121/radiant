import type { DeFiProviderId } from "../../defi/types.js";
import type { LiquidityFallbackOffer } from "../../defi/cross-chain/cross-chain.types.js";
import type { TransactionFiatPreview } from "../../market/valuation.types.js";

export type DeFiApprovalPreviewKind = "swap" | "bridge" | "transfer" | "generic" | "lifi_continue";

export type DeFiApprovalAssetLine = {
  symbol: string;
  amount_display: string;
  chain_label?: string;
};

/** Provider-agnostic approval UI payload for swaps, bridges, and future DeFi executes. */
export type DeFiApprovalPreview = {
  kind: DeFiApprovalPreviewKind;
  provider_id?: DeFiProviderId;
  title: string;
  amount_display: string;
  pay?: DeFiApprovalAssetLine;
  receive?: DeFiApprovalAssetLine;
  route_summary?: string;
  bridges?: string[];
  fee_cost_usd?: number | null;
  quote_expires_at?: string | null;
  slippage?: number | null;
  fiat_preview?: TransactionFiatPreview | null;
  /** True when route uses Squid liquidity fallback instead of Li-Fi primary. */
  alternate_route?: boolean;
  /** Short label for alternate-route badge in approval UI. */
  route_provider_label?: string;
};

export type LiquidityFallbackPendingPreview = {
  approval_outcome: "liquidity_fallback_offered";
  liquidity_fallback_offer: LiquidityFallbackOffer;
  primary_error_code?: string;
};
