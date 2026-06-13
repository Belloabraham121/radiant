import type { ExecuteTransactionInput } from "../../chains/types.js";
import type { PendingTransaction } from "../agent.types.js";

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
    case "deepbook_place_limit_order":
      parts.push(
        "The user requested a DeepBook limit order using their balance manager.",
        ctx.amount_display ? `Order: ${ctx.amount_display}.` : "",
        "If funds are insufficient, explain the shortage is in the DeepBook balance manager — suggest depositing or reducing size.",
      );
      break;
    case "deepbook_place_market_order":
      parts.push(
        "The user requested a DeepBook market order using their balance manager.",
        ctx.amount_display ? `Order: ${ctx.amount_display}.` : "",
        "If funds are insufficient, explain the shortage is in the DeepBook balance manager.",
      );
      break;
    case "deepbook_cancel_order":
    case "deepbook_cancel_orders":
    case "deepbook_cancel_all_orders":
      parts.push(
        "The user requested cancelling DeepBook orders.",
        ctx.summary ? ctx.summary : "",
      );
      break;
    case "deepbook_modify_order":
      parts.push(
        "The user requested modifying a DeepBook order (size only — price cannot be changed via this action).",
        ctx.amount_display ? `Change: ${ctx.amount_display}.` : "",
      );
      break;
    case "deepbook_withdraw_settled_amounts":
    case "deepbook_withdraw_settled_amounts_permissionless":
      parts.push(
        "The user requested claiming settled proceeds from filled DeepBook orders into their balance manager.",
        ctx.summary ? ctx.summary : "",
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
