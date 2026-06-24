import type { ExecuteTransactionInput } from "../../../../chains/types.js";
import type { ExecutePreflightRegistration } from "../../types.js";
import {
  isDeepBookSwapAction,
  preflightDeepBookSwap,
} from "../../../../defi/deepbook/deepbook-swap.service.js";
import {
  preflightDeepBookPlaceLimitOrder,
  preflightDeepBookPlaceMarketOrder,
  preflightDeepBookModifyOrder,
  preflightDeepBookWithdrawSettled,
  preflightDeepBookWithdrawSettledPermissionless,
} from "../../../../defi/deepbook/deepbook-orders.service.js";
import { preflightDeepBookWithdraw } from "../../../../defi/deepbook/deepbook-balance-manager.service.js";
import {
  isDeepBookFlashLoanAction,
  preflightDeepBookFlashLoan,
} from "../../../../defi/deepbook/deepbook-flash-loan.service.js";
import { isDeepBookMarginAction } from "../../../../defi/deepbook/deepbook-margin.service.js";
import { preflightMarginAction } from "../../../../defi/deepbook/deepbook-margin-execution.service.js";
import {
  isDeepBookMarginMaintainerAction,
  preflightMarginMaintainerAction,
} from "../../../../defi/deepbook/deepbook-margin-maintainer.service.js";

export const deepBookPreflightHooks: readonly ExecutePreflightRegistration[] = [
  {
    match: isDeepBookSwapAction,
    run: async (privyUserId, input) => preflightDeepBookSwap(privyUserId, input.params),
  },
  {
    match: (action) => action === "deepbook_place_limit_order",
    run: async (privyUserId, input) =>
      preflightDeepBookPlaceLimitOrder(privyUserId, input.params),
  },
  {
    match: (action) => action === "deepbook_place_market_order",
    run: async (privyUserId, input) =>
      preflightDeepBookPlaceMarketOrder(privyUserId, input.params),
  },
  {
    match: (action) => action === "deepbook_modify_order",
    run: async (privyUserId, input) => preflightDeepBookModifyOrder(privyUserId, input.params),
  },
  {
    match: (action) => action === "deepbook_withdraw_settled_amounts",
    run: async (privyUserId, input) =>
      preflightDeepBookWithdrawSettled(privyUserId, input.params),
  },
  {
    match: (action) => action === "deepbook_withdraw_settled_amounts_permissionless",
    run: async (privyUserId, input) =>
      preflightDeepBookWithdrawSettledPermissionless(privyUserId, input.params),
  },
  {
    match: (action) => action === "deepbook_withdraw",
    run: async (privyUserId, input) => preflightDeepBookWithdraw(privyUserId, input.params),
  },
  {
    match: isDeepBookFlashLoanAction,
    run: async (privyUserId, input) => preflightDeepBookFlashLoan(privyUserId, input.params),
  },
  {
    match: isDeepBookMarginMaintainerAction,
    run: async (_privyUserId, input) =>
      preflightMarginMaintainerAction(input.action, input.params),
  },
  {
    match: isDeepBookMarginAction,
    run: async (privyUserId, input) =>
      preflightMarginAction(privyUserId, input.action, input.params),
  },
];

export async function runDeepBookPreflightHooks(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<void> {
  for (const hook of deepBookPreflightHooks) {
    if (hook.match(input.action)) {
      await hook.run(privyUserId, input);
    }
  }
}
