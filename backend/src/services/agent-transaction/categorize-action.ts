import { isDeepBookSwapAction } from "../defi/deepbook-swap.service.js";
import { isDeepBookCancelOrderAction, isDeepBookPlaceOrderAction } from "../defi/deepbook-orders.service.js";
import { isDeepBookFlashLoanAction } from "../defi/deepbook-flash-loan.service.js";
import { isDeepBookProvisionAction } from "../agent/validate-execute-transaction.js";
import type { AgentTransactionCategory } from "./agent-transaction.types.js";

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

export function categorizeAgentTransactionAction(action: string): AgentTransactionCategory {
  if (isDeepBookSwapAction(action)) {
    return "swap";
  }

  if (TRANSFER_ACTIONS.has(action)) {
    return "transfer";
  }

  if (isDeepBookProvisionAction(action) || DEEPBOOK_BALANCE_ACTIONS.has(action)) {
    return "deepbook_balance";
  }

  if (isDeepBookPlaceOrderAction(action)) {
    return "deepbook_order";
  }

  if (isDeepBookCancelOrderAction(action)) {
    return "deepbook_cancel";
  }

  if (action === "deepbook_modify_order") {
    return "deepbook_modify";
  }

  if (DEEPBOOK_SETTLED_ACTIONS.has(action)) {
    return "deepbook_settled";
  }

  if (isDeepBookFlashLoanAction(action)) {
    return "flash_loan";
  }

  return "other";
}
