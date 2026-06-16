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
    case "deepbook_margin_deposit":
    case "deepbook_margin_withdraw":
      parts.push(
        "The user requested a margin manager deposit/withdrawal.",
        ctx.amount_display ? `Amount: ${ctx.amount_display}.` : "",
        "If risk ratio is too low for withdrawal, explain the position must be reduced first or collateral added.",
      );
      break;
    case "deepbook_margin_borrow":
    case "deepbook_margin_repay":
      parts.push(
        "The user requested a margin borrow/repay.",
        ctx.amount_display ? `Amount: ${ctx.amount_display}.` : "",
        "Borrow failures often mean the risk ratio would drop below the borrow threshold (1.25). Suggest depositing more collateral or borrowing less.",
      );
      break;
    case "deepbook_margin_place_limit_order":
    case "deepbook_margin_place_market_order":
    case "deepbook_margin_place_reduce_only_limit_order":
    case "deepbook_margin_place_reduce_only_market_order":
      parts.push(
        "The user requested a leveraged margin order on DeepBook.",
        ctx.amount_display ? `Order: ${ctx.amount_display}.` : "",
        "If it fails with risk ratio error, the position would become too leveraged. Suggest reducing size or adding collateral.",
      );
      break;
    case "deepbook_margin_cancel_orders":
    case "deepbook_margin_cancel_all_orders":
      parts.push(
        "The user requested cancelling margin orders on DeepBook.",
        "If order IDs are stale, suggest querying open orders first.",
      );
      break;
    case "deepbook_margin_withdraw_settled":
    case "deepbook_margin_withdraw_settled_permissionless":
      parts.push(
        "The user requested withdrawing settled trade proceeds from their margin manager.",
        "If nothing settles, explain there may be no settled amounts yet.",
      );
      break;
    case "deepbook_margin_update_price":
      parts.push(
        "The user requested refreshing the Pyth oracle price for a margin pool.",
        "This is often needed before borrow/repay or risk checks when the on-chain price is stale.",
      );
      break;
    case "deepbook_margin_stake":
    case "deepbook_margin_unstake":
      parts.push(
        "The user requested staking/unstaking DEEP via their margin manager.",
        ctx.amount_display ? `Amount: ${ctx.amount_display}.` : "",
        "DEEP must be deposited to the margin manager first (deepbook_margin_deposit coin_type deep).",
      );
      break;
    case "deepbook_margin_submit_proposal":
    case "deepbook_margin_vote":
      parts.push(
        "The user requested margin pool governance (proposal or vote).",
        "Requires Allow governance in agent settings and active stake on the margin manager.",
      );
      break;
    case "deepbook_margin_claim_rebate":
      parts.push(
        "The user requested claiming unclaimed trading rebates from their margin manager.",
      );
      break;
    case "deepbook_margin_liquidate":
      parts.push(
        "The user requested liquidating an undercollateralized margin manager.",
        "The liquidator wallet must hold enough of the debt asset (repay_amount) to repay debt.",
      );
      break;
    case "deepbook_margin_set_referral":
    case "deepbook_margin_unset_referral":
      parts.push(
        "The user requested changing margin manager pool referral settings.",
      );
      break;
    case "deepbook_predict_deposit":
    case "deepbook_predict_withdraw":
      parts.push(
        "The user requested a deposit/withdrawal on their Predict manager.",
        ctx.amount_display ? `Amount: ${ctx.amount_display}.` : "",
      );
      break;
    case "deepbook_predict_mint":
    case "deepbook_predict_mint_range":
      parts.push(
        "The user requested minting a prediction market position.",
        ctx.summary ? ctx.summary : "",
        "Failures may be due to: oracle not active, insufficient balance in predict manager, trading paused, or strike/expiry out of bounds.",
      );
      break;
    case "deepbook_predict_redeem":
    case "deepbook_predict_redeem_range":
      parts.push(
        "The user requested redeeming a prediction market position.",
        ctx.summary ? ctx.summary : "",
        "If insufficient position quantity, explain they may not have that position or already redeemed it.",
      );
      break;
    case "deepbook_predict_supply":
    case "deepbook_predict_lp_withdraw":
      parts.push(
        "The user requested a Predict vault LP operation (supply/withdraw).",
        ctx.amount_display ? `Amount: ${ctx.amount_display}.` : "",
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
