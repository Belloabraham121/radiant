import type { ExecuteTransactionInput } from "../chains/types.js";
import type { PendingTransaction } from "./agent.types.js";

export type TransactionErrorContext = {
  action: string;
  amount_display?: string;
  summary?: string;
  coin_key?: string;
};

export function transactionContextFromInput(
  input: ExecuteTransactionInput | null | undefined,
): TransactionErrorContext | undefined {
  if (!input?.action) {
    return undefined;
  }

  const coinKey =
    typeof input.params.coin_key === "string" ? input.params.coin_key : undefined;

  return {
    action: input.action,
    coin_key: coinKey,
    amount_display:
      typeof input.params.amount_display === "number"
        ? `${input.params.amount_display} ${coinKey ?? ""}`.trim()
        : undefined,
    summary: undefined,
  };
}

export function transactionContextFromPending(
  pending: PendingTransaction,
): TransactionErrorContext {
  const coinKey =
    typeof pending.params.coin_key === "string" ? pending.params.coin_key : undefined;

  return {
    action: pending.action,
    coin_key: coinKey,
    amount_display: pending.amount_display,
    summary: pending.summary,
  };
}

export function buildTransactionErrorUserContext(
  ctx: TransactionErrorContext | undefined,
  base = "",
): string {
  if (!ctx) {
    return base;
  }

  const parts = [base].filter(Boolean);

  switch (ctx.action) {
    case "deepbook_withdraw":
      parts.push(
        "The user requested a withdrawal from their DeepBook balance manager (not a swap and not directly from their main wallet).",
        ctx.amount_display
          ? `They tried to withdraw ${ctx.amount_display}.`
          : "They tried to withdraw funds from the manager.",
        "If funds are insufficient, explain the shortage is in the DeepBook balance manager balance — suggest checking DeepBook manager balances or withdrawing a smaller amount.",
      );
      break;
    case "deepbook_deposit":
      parts.push(
        "The user requested a deposit into their DeepBook balance manager from their agent wallet.",
        ctx.amount_display ? `Amount: ${ctx.amount_display}.` : "",
        "If funds are insufficient, explain their agent wallet may not have enough of that token or SUI for gas.",
      );
      break;
    case "deepbook_provision_manager":
      parts.push(
        "The user was setting up their DeepBook balance manager (gas-only transaction).",
        "If it failed, mention SUI for network gas on the agent wallet.",
      );
      break;
    case "swap":
    case "deepbook_swap":
      parts.push(
        "The user requested a DeepBook swap using coins in their agent wallet.",
        ctx.amount_display ? `Swap size: ${ctx.amount_display}.` : "",
      );
      break;
    default:
      if (ctx.summary) {
        parts.push(`Transaction: ${ctx.summary}.`);
      }
      break;
  }

  return parts.filter(Boolean).join(" ");
}
