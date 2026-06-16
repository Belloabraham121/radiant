import { AppError } from "../../../errors/app-error.js";
import { parseDeepBookDepositWithdrawParams } from "../../defi/deepbook/deepbook-balance-manager.service.js";
import {
  isDeepBookSwapAction,
  parseDeepBookSwapParams,
} from "../../defi/deepbook/deepbook-swap.service.js";
import {
  parseDeepBookCancelAllOrdersParams,
  parseDeepBookCancelOrderParams,
  parseDeepBookCancelOrdersParams,
  parseDeepBookLimitOrderParams,
  parseDeepBookMarketOrderParams,
  parseDeepBookModifyOrderParams,
  parseDeepBookWithdrawSettledParams,
} from "../../defi/deepbook/deepbook-orders.service.js";
import {
  isDeepBookFlashLoanAction,
  parseDeepBookFlashLoanParams,
} from "../../defi/deepbook/deepbook-flash-loan.service.js";
import {
  isDeepBookStakeAction,
  parseDeepBookStakeParams,
  parseDeepBookUnstakeParams,
} from "../../defi/deepbook/deepbook-stake.service.js";
import {
  isDeepBookGovernanceAction,
  parseDeepBookSubmitProposalParams,
  parseDeepBookVoteParams,
} from "../../defi/deepbook/deepbook-governance.service.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";

export const DEEPBOOK_PROVISION_MANAGER_ACTION = "deepbook_provision_manager" as const;
export const DEEPBOOK_PROVISION_MARGIN_MANAGER_ACTION = "deepbook_provision_margin_manager" as const;

export function isDeepBookProvisionAction(action: string): boolean {
  return action === DEEPBOOK_PROVISION_MANAGER_ACTION || action === DEEPBOOK_PROVISION_MARGIN_MANAGER_ACTION;
}

/** Validate execute_transaction params before queueing approval or broadcasting. */
export function validateExecuteTransactionInput(input: ExecuteTransactionInput): void {
  if (input.chain_id !== "sui" && isDeepBookProvisionAction(input.action)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "deepbook_provision_manager is only available on Sui.",
    );
  }

  if (input.action === "deepbook_deposit" || input.action === "deepbook_withdraw") {
    parseDeepBookDepositWithdrawParams(input.params);
    return;
  }

  if (isDeepBookProvisionAction(input.action)) {
    return;
  }

  if (isDeepBookSwapAction(input.action)) {
    parseDeepBookSwapParams(input.params);
    return;
  }

  if (input.action === "deepbook_place_limit_order") {
    parseDeepBookLimitOrderParams(input.params);
    return;
  }

  if (input.action === "deepbook_place_market_order") {
    parseDeepBookMarketOrderParams(input.params);
    return;
  }

  if (input.action === "deepbook_cancel_order") {
    parseDeepBookCancelOrderParams(input.params);
    return;
  }

  if (input.action === "deepbook_cancel_all_orders") {
    parseDeepBookCancelAllOrdersParams(input.params);
    return;
  }

  if (input.action === "deepbook_cancel_orders") {
    parseDeepBookCancelOrdersParams(input.params);
    return;
  }

  if (input.action === "deepbook_modify_order") {
    parseDeepBookModifyOrderParams(input.params);
    return;
  }

  if (
    input.action === "deepbook_withdraw_settled_amounts" ||
    input.action === "deepbook_withdraw_settled_amounts_permissionless"
  ) {
    parseDeepBookWithdrawSettledParams(input.params);
    return;
  }

  if (isDeepBookFlashLoanAction(input.action)) {
    parseDeepBookFlashLoanParams(input.params);
    return;
  }

  if (input.action === "deepbook_stake") {
    parseDeepBookStakeParams(input.params);
    return;
  }

  if (input.action === "deepbook_unstake") {
    parseDeepBookUnstakeParams(input.params);
    return;
  }

  if (input.action === "deepbook_submit_proposal") {
    parseDeepBookSubmitProposalParams(input.params);
    return;
  }

  if (input.action === "deepbook_vote") {
    parseDeepBookVoteParams(input.params);
    return;
  }

  if (input.action.startsWith("deepbook_margin_")) {
    return;
  }

  if (input.action.startsWith("deepbook_predict_")) {
    return;
  }
}
