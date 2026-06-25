import type { PartialBridgeIntent } from "./bridge/bridge-intent.types.js";
import {
  resolveUserAmountToToken,
  type ResolvedTokenAmount,
} from "../market/resolve-user-amount.js";
import type { PartialSwapIntent } from "./swap/swap-intent.types.js";

export type ResolvedSwapAmounts = PartialSwapIntent & {
  resolvedTokenAmount?: ResolvedTokenAmount;
};

export type ResolvedBridgeAmounts = PartialBridgeIntent & {
  resolvedTokenAmount?: ResolvedTokenAmount;
};

/** Resolve USD-denominated swap amount to token units at execution/quote time. */
export async function resolveSwapIntentAmount(
  intent: PartialSwapIntent,
): Promise<ResolvedSwapAmounts> {
  if (intent.amount === undefined) {
    return intent;
  }

  const unit = intent.amountUnit ?? "token";
  if (unit !== "usd") {
    return intent;
  }

  const side = intent.amountSide ?? "pay";
  const symbol =
    side === "receive"
      ? (intent.outputCoin ?? intent.inputCoin ?? "")
      : (intent.inputCoin ?? intent.outputCoin ?? "");

  if (!symbol) {
    return intent;
  }

  const resolved = await resolveUserAmountToToken({
    value: intent.amount,
    unit: "usd",
    symbol,
    amountSide: side,
    outputSymbol: intent.outputCoin,
  });

  return {
    ...intent,
    amount: resolved.amountDisplay,
    resolvedTokenAmount: resolved,
  };
}

/** Resolve USD-denominated bridge amount to source-token units at execution time. */
export async function resolveBridgeIntentAmount(
  intent: PartialBridgeIntent,
): Promise<ResolvedBridgeAmounts> {
  if (intent.amount === undefined || !intent.fromToken) {
    return intent;
  }

  const unit = intent.amountUnit ?? "token";
  if (unit !== "usd") {
    return intent;
  }

  const resolved = await resolveUserAmountToToken({
    value: intent.amount,
    unit: "usd",
    symbol: intent.fromToken,
    amountSide: "pay",
  });

  return {
    ...intent,
    amount: resolved.amountDisplay,
    resolvedTokenAmount: resolved,
  };
}
