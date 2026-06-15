import { isDeepBookSwapAction } from "../../defi/deepbook/deepbook-swap.service.js";
import {
  isDeepBookCancelOrderAction,
  isDeepBookPlaceOrderAction,
} from "../../defi/deepbook/deepbook-orders.service.js";
import { isDeepBookFlashLoanAction } from "../../defi/deepbook/deepbook-flash-loan.service.js";
import { isDeepBookStakeAction } from "../../defi/deepbook/deepbook-stake.service.js";
import { isDeepBookGovernanceAction } from "../../defi/deepbook/deepbook-governance.service.js";
import { isDeepBookProvisionAction } from "./validate-execute-transaction.js";
import type { AgentTransactionCategory } from "../../agent-transaction/agent-transaction.types.js";

const TRANSFER_ACTIONS = new Set([
  "transfer_native",
  "transfer_sui",
  "transfer",
  "transfer_eth",
  "transfer_sol",
]);

const DEEPBOOK_BALANCE_ACTIONS = new Set(["deepbook_deposit", "deepbook_withdraw"]);

const DEEPBOOK_SETTLED_ACTIONS = new Set([
  "deepbook_withdraw_settled_amounts",
  "deepbook_withdraw_settled_amounts_permissionless",
]);

const MARGIN_BALANCE_ACTIONS = new Set([
  "deepbook_margin_deposit",
  "deepbook_margin_withdraw",
  "deepbook_margin_borrow",
  "deepbook_margin_repay",
  "deepbook_margin_supply_pool",
  "deepbook_margin_withdraw_pool",
]);

const MARGIN_ORDER_ACTIONS = new Set([
  "deepbook_margin_place_limit_order",
  "deepbook_margin_place_market_order",
]);

const MARGIN_CANCEL_ACTIONS = new Set(["deepbook_margin_cancel_order"]);

const PREDICT_ACTIONS = new Set([
  "deepbook_predict_deposit",
  "deepbook_predict_withdraw",
  "deepbook_predict_mint",
  "deepbook_predict_redeem",
  "deepbook_predict_mint_range",
  "deepbook_predict_redeem_range",
  "deepbook_predict_supply",
  "deepbook_predict_lp_withdraw",
]);

/** High-level execute_transaction action families for approval rules and ledger categories. */
export type ExecuteActionClass =
  | "transfer"
  | "swap"
  | "order"
  | "cancel"
  | "modify"
  | "balance"
  | "provision"
  | "settled"
  | "stake"
  | "governance"
  | "flash_loan"
  | "margin"
  | "predict"
  | "other";

export function classifyExecuteAction(action: string): ExecuteActionClass {
  if (isDeepBookSwapAction(action)) {
    return "swap";
  }

  if (TRANSFER_ACTIONS.has(action)) {
    return "transfer";
  }

  if (isDeepBookProvisionAction(action)) {
    return "provision";
  }

  if (DEEPBOOK_BALANCE_ACTIONS.has(action)) {
    return "balance";
  }

  if (isDeepBookPlaceOrderAction(action)) {
    return "order";
  }

  if (isDeepBookCancelOrderAction(action)) {
    return "cancel";
  }

  if (action === "deepbook_modify_order") {
    return "modify";
  }

  if (DEEPBOOK_SETTLED_ACTIONS.has(action)) {
    return "settled";
  }

  if (isDeepBookFlashLoanAction(action)) {
    return "flash_loan";
  }

  if (isDeepBookStakeAction(action)) {
    return "stake";
  }

  if (isDeepBookGovernanceAction(action)) {
    return "governance";
  }

  if (MARGIN_BALANCE_ACTIONS.has(action)) {
    return "margin";
  }

  if (MARGIN_ORDER_ACTIONS.has(action)) {
    return "order";
  }

  if (MARGIN_CANCEL_ACTIONS.has(action)) {
    return "cancel";
  }

  if (action === "deepbook_margin_modify_order") {
    return "modify";
  }

  if (PREDICT_ACTIONS.has(action)) {
    return "predict";
  }

  return "other";
}

const EXECUTE_CLASS_TO_LEDGER_CATEGORY: Record<ExecuteActionClass, AgentTransactionCategory> = {
  transfer: "transfer",
  swap: "swap",
  order: "deepbook_order",
  cancel: "deepbook_cancel",
  modify: "deepbook_modify",
  balance: "deepbook_balance",
  provision: "deepbook_balance",
  settled: "deepbook_settled",
  flash_loan: "flash_loan",
  stake: "stake",
  governance: "governance",
  margin: "margin",
  predict: "predict",
  other: "other",
};

export function categorizeAgentTransactionAction(action: string): AgentTransactionCategory {
  return EXECUTE_CLASS_TO_LEDGER_CATEGORY[classifyExecuteAction(action)];
}
