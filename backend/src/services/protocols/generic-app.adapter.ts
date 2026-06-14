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

const GENERIC_ACTIONS = APP_ACTION_NAMES.filter((name) => {
  const protocol = getAppActionDefinition(name).protocol;
  return protocol === "transfer" || protocol === "generic";
});

/** Fallback adapter for transfer and non-DeFi actions on custom projects. */
export const genericAppAdapter: AppProtocolAdapter = {
  id: "custom",

  supportedActions() {
    return GENERIC_ACTIONS;
  },

  supportsAction(action: AppActionName) {
    const protocol = getAppActionDefinition(action).protocol;
    return protocol === "transfer" || protocol === "generic";
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
