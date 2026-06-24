import type { ChainId } from "../../chains/types.js";

/** Parsed swap slots from a user message (may be incomplete). */
export type PartialSwapIntent = {
  originalMessage: string;
  amount?: number;
  /** Whether `amount` is paid in or received out. */
  amountSide?: "pay" | "receive";
  inputCoin?: string;
  outputCoin?: string;
  chainId?: ChainId;
  evmChainId?: number;
};

export type SwapIntentField =
  | "input_coin"
  | "output_coin"
  | "amount"
  | "amount_side"
  | "chain_id"
  | "bridge_confirm";

export const SWAP_KNOWN_COINS = [
  "SUI",
  "USDC",
  "USDT",
  "DEEP",
  "WAL",
  "ETH",
  "SOL",
  "DBUSDC",
  "DBUSDT",
] as const;

export type SwapKnownCoin = (typeof SWAP_KNOWN_COINS)[number];
