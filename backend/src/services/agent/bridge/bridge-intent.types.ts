import type { ChainId } from "../../chains/types.js";
import type { AmountUnit } from "../swap/swap-intent.types.js";

export type { AmountUnit };

/** Parsed bridge slots from a user message (may be incomplete). */
export type PartialBridgeIntent = {
  originalMessage: string;
  amount?: number;
  /** Whether `amount` is in token units or USD. Defaults to "token". */
  amountUnit?: AmountUnit;
  /** User confirmed ambiguous sub-1 token vs USD interpretation. */
  amountUnitConfirmed?: boolean;
  fromToken?: string;
  toToken?: string;
  fromChainId?: ChainId;
  fromEvmChainId?: number;
  toChainId?: ChainId;
  toEvmChainId?: number;
  /** User explicitly wants the same symbol on the destination (cross-ecosystem). */
  confirmSameToken?: boolean;
};

export type BridgeIntentField =
  | "from_chain"
  | "to_chain"
  | "from_token"
  | "to_token"
  | "amount"
  | "amount_unit"
  | "confirm_same_token"
  | "stellar_unsupported";

/** Tokens commonly bridged via Li-Fi on this product. */
export const BRIDGE_KNOWN_TOKENS = [
  "SUI",
  "USDC",
  "USDT",
  "ETH",
  "WETH",
  "SOL",
  "DEEP",
] as const;

export type BridgeKnownToken = (typeof BRIDGE_KNOWN_TOKENS)[number];
