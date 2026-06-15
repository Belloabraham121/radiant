import { runExecuteTransactionToolWithApproval } from "../agent/execute-transaction-with-approval.js";
import { APP_ACTION_NAMES, getAppActionDefinition } from "../projects/app-action-registry.js";
import type { AppActionContext, AppActionName, AppActionResult } from "../projects/app-action.types.js";
import {
  buildAgentToolOptionsFromContext,
  mapExecuteOutcomeToAppActionResult,
  mapThrownErrorToAppActionResult,
} from "../projects/app-action-result.js";
import { validateAppActionInput } from "../projects/app-action-mapper.js";
import type { AppProtocolAdapter } from "./app-protocol-adapter.types.js";

const DEEPBOOK_ACTIONS = APP_ACTION_NAMES.filter(
  (name) => getAppActionDefinition(name).protocol === "deepbook",
);

/** DeepBook adapter — wraps existing execute_transaction + approval path. */
export const deepBookAppAdapter: AppProtocolAdapter = {
  id: "deepbook",

  supportedActions() {
    return DEEPBOOK_ACTIONS;
  },

  supportsAction(action: AppActionName) {
    return getAppActionDefinition(action).protocol === "deepbook";
  },

  async execute(
    action: AppActionName,
    params: unknown,
    ctx: AppActionContext,
  ): Promise<AppActionResult> {
    try {
      const input = validateAppActionInput(action, params, { chain_id: ctx.chainId });
      const outcome = await runExecuteTransactionToolWithApproval(
        ctx.privyUserId,
        input,
        buildAgentToolOptionsFromContext(ctx),
      );
      return mapExecuteOutcomeToAppActionResult(action, outcome);
    } catch (err) {
      return mapThrownErrorToAppActionResult(action, err);
    }
  },
};
