import type { ChainId } from "../../chains/types.js";

/** Parsed bridge slots from a user message (may be incomplete). */
export type PartialBridgeIntent = {
  originalMessage: string;
  amount?: number;
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
  | "confirm_same_token";

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
