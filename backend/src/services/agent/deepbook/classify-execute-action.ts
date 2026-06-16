import { isDeepBookSwapAction } from "../../defi/deepbook/deepbook-swap.service.js";
import {
  isDeepBookCancelOrderAction,
  isDeepBookPlaceOrderAction,
} from "../../defi/deepbook/deepbook-orders.service.js";
import { isDeepBookFlashLoanAction } from "../../defi/deepbook/deepbook-flash-loan.service.js";
import { isDeepBookStakeAction } from "../../defi/deepbook/deepbook-stake.service.js";
import { isDeepBookGovernanceAction } from "../../defi/deepbook/deepbook-governance.service.js";
import { isDeepBookProvisionAction } from "./deepbook-provision-actions.js";
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
  "deepbook_margin_mint_supply_referral",
  "deepbook_margin_withdraw_referral_fees",
  "deepbook_margin_tpsl_execute",
]);

const MARGIN_ORDER_ACTIONS = new Set([
  "deepbook_margin_place_limit_order",
  "deepbook_margin_place_market_order",
  "deepbook_margin_place_reduce_only_limit_order",
  "deepbook_margin_place_reduce_only_market_order",
]);

const MARGIN_TPSL_ADD_ACTIONS = new Set(["deepbook_margin_tpsl_add"]);
const MARGIN_TPSL_CANCEL_ACTIONS = new Set([
  "deepbook_margin_tpsl_cancel",
  "deepbook_margin_tpsl_cancel_all",
]);
const MARGIN_CANCEL_ACTIONS = new Set([
  "deepbook_margin_cancel_order",
  "deepbook_margin_cancel_orders",
  "deepbook_margin_cancel_all_orders",
]);

const MARGIN_SETTLED_ACTIONS = new Set([
  "deepbook_margin_withdraw_settled",
  "deepbook_margin_withdraw_settled_permissionless",
]);

const MARGIN_ORACLE_ACTIONS = new Set(["deepbook_margin_update_price"]);

const MARGIN_STAKE_ACTIONS = new Set([
  "deepbook_margin_stake",
  "deepbook_margin_unstake",
]);

const MARGIN_GOVERNANCE_ACTIONS = new Set([
  "deepbook_margin_submit_proposal",
  "deepbook_margin_vote",
]);

const MARGIN_REBATE_ACTIONS = new Set(["deepbook_margin_claim_rebate"]);

const MARGIN_LIQUIDATE_ACTIONS = new Set(["deepbook_margin_liquidate"]);
const MARGIN_REFERRAL_ACTIONS = new Set([
  "deepbook_margin_set_referral",
  "deepbook_margin_unset_referral",
]);

const MARGIN_MAINTAINER_ACTIONS = new Set([
  "deepbook_margin_maintainer_create_pool",
  "deepbook_margin_maintainer_enable_pool_for_loan",
  "deepbook_margin_maintainer_disable_pool_for_loan",
  "deepbook_margin_maintainer_update_interest_params",
  "deepbook_margin_maintainer_update_pool_config",
  "deepbook_margin_maintainer_withdraw_maintainer_fees",
  "deepbook_margin_maintainer_withdraw_protocol_fees",
  "deepbook_margin_maintainer_admin_withdraw_default_referral_fees",
]);

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

  if (MARGIN_TPSL_ADD_ACTIONS.has(action)) {
    return "order";
  }

  if (MARGIN_CANCEL_ACTIONS.has(action) || MARGIN_TPSL_CANCEL_ACTIONS.has(action)) {
    return "cancel";
  }

  if (MARGIN_SETTLED_ACTIONS.has(action)) {
    return "settled";
  }

  if (MARGIN_ORACLE_ACTIONS.has(action)) {
    return "margin";
  }

  if (MARGIN_STAKE_ACTIONS.has(action)) {
    return "stake";
  }

  if (MARGIN_GOVERNANCE_ACTIONS.has(action)) {
    return "governance";
  }

  if (MARGIN_REBATE_ACTIONS.has(action)) {
    return "margin";
  }

  if (MARGIN_LIQUIDATE_ACTIONS.has(action)) {
    return "margin";
  }

  if (MARGIN_REFERRAL_ACTIONS.has(action)) {
    return "margin";
  }

  if (MARGIN_MAINTAINER_ACTIONS.has(action)) {
    return "other";
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
