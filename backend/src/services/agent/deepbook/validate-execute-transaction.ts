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
import { isDeepBookMarginMaintainerAction } from "../../defi/deepbook/deepbook-margin-maintainer.service.js";
import { normalizeAppActionParams } from "../../projects/app-action-param-coerce.js";
import { getAppActionParamSchema } from "../../projects/app-action-param-schemas.js";
import {
  ONCHAIN_ACTION_NAMES,
  getAppActionDefinition,
} from "../../projects/app-action-registry.js";
import type { OnchainActionName } from "../../projects/app-action.types.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import {
  DEEPBOOK_PROVISION_MANAGER_ACTION,
  DEEPBOOK_PROVISION_MARGIN_MANAGER_ACTION,
  isDeepBookProvisionAction,
} from "./deepbook-provision-actions.js";

export {
  DEEPBOOK_PROVISION_MANAGER_ACTION,
  DEEPBOOK_PROVISION_MARGIN_MANAGER_ACTION,
  isDeepBookProvisionAction,
} from "./deepbook-provision-actions.js";

function resolveAppActionForExecuteAction(executeAction: string): OnchainActionName | null {
  for (const name of ONCHAIN_ACTION_NAMES) {
    if (getAppActionDefinition(name).execute_action === executeAction) {
      return name;
    }
  }
  return null;
}

function formatZodError(error: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  const first = error.issues[0];
  if (!first) {
    return "Invalid action parameters";
  }
  const path = first.path.length > 0 ? `params.${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

function validateMappedAppActionParams(appAction: OnchainActionName, params: Record<string, unknown>): void {
  const normalized = normalizeAppActionParams(appAction, params);
  const schema = getAppActionParamSchema(appAction);
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", formatZodError(parsed.error), {
      action: appAction,
      issues: parsed.error.issues,
    });
  }
}

function validateDeepBookMarginExecuteParams(action: string, params: Record<string, unknown>): void {
  const appAction = resolveAppActionForExecuteAction(action);
  if (appAction) {
    validateMappedAppActionParams(appAction, params);
    return;
  }

  throw new AppError(400, "VALIDATION_ERROR", `Unknown margin execute action: ${action}`, { action });
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

  if (input.action === DEEPBOOK_PROVISION_MARGIN_MANAGER_ACTION) {
    validateMappedAppActionParams("margin_provision_manager", input.params);
    return;
  }

  if (input.action === DEEPBOOK_PROVISION_MANAGER_ACTION) {
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
    if (isDeepBookMarginMaintainerAction(input.action)) {
      return;
    }
    validateDeepBookMarginExecuteParams(input.action, input.params);
    return;
  }

  if (input.action.startsWith("deepbook_predict_")) {
    return;
  }
}
