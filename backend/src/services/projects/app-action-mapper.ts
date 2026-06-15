import { AppError } from "../../errors/app-error.js";
import { validateExecuteTransactionInput } from "../agent/deepbook/validate-execute-transaction.js";
import { categorizeAgentTransactionAction } from "../agent-transaction/deepbook/categorize-action.js";
import type { AgentTransactionCategory } from "../agent-transaction/agent-transaction.types.js";
import type { ChainId, ExecuteTransactionInput } from "../chains/types.js";
import { getAppActionParamSchema } from "./app-action-param-schemas.js";
import { normalizeAppActionParams } from "./app-action-param-coerce.js";
import {
  APP_ACTION_NAMES,
  getAppActionDefinition,
  isAppActionName,
} from "./app-action-registry.js";
import type { AppActionName } from "./app-action.types.js";

export type MapAppActionOptions = {
  chain_id?: ChainId;
};

/**
 * Parse and validate params for a canonical app action (Zod layer).
 * Returns normalized params object passed to execute_transaction.
 */
export function parseAppActionParams(
  action: AppActionName,
  params: unknown,
): Record<string, unknown> {
  const normalized = normalizeAppActionParams(action, params);
  const schema = getAppActionParamSchema(action);
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", formatZodError(parsed.error), {
      action,
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

/** Map canonical app action + params to execute_transaction input (no deepbook parse yet). */
export function mapAppActionToExecuteInput(
  action: AppActionName,
  params: Record<string, unknown>,
  options: MapAppActionOptions = {},
): ExecuteTransactionInput {
  const definition = getAppActionDefinition(action);
  const chain_id = options.chain_id ?? definition.default_chain_id;

  return {
    chain_id,
    action: definition.execute_action,
    params,
  };
}

/**
 * Full validation: Zod app params → execute_transaction shape → existing DeepBook validators.
 */
export function validateAppActionInput(
  action: AppActionName,
  params: unknown,
  options: MapAppActionOptions = {},
): ExecuteTransactionInput {
  const parsedParams = parseAppActionParams(action, params);
  const input = mapAppActionToExecuteInput(action, parsedParams, options);
  validateExecuteTransactionInput(input);
  return input;
}

/** Resolve ledger category for a canonical app action. */
export function categorizeAppAction(action: AppActionName): AgentTransactionCategory {
  const definition = getAppActionDefinition(action);
  return definition.category;
}

/** Resolve ledger category from a string that may be a canonical or legacy name. */
export function categorizeAppActionName(actionName: string): AgentTransactionCategory {
  if (isAppActionName(actionName)) {
    return categorizeAppAction(actionName);
  }
  return categorizeAgentTransactionAction(actionName);
}

/** Parse action name from HTTP path segment; throws VALIDATION_ERROR if unknown. */
export function parseAppActionName(actionName: string): AppActionName {
  if (!isAppActionName(actionName)) {
    throw new AppError(400, "VALIDATION_ERROR", `Unknown app action: ${actionName}`, {
      known_actions: APP_ACTION_NAMES,
    });
  }
  return actionName;
}

/** Map execute_transaction action string to canonical app action when supported. */
export function mapExecuteActionToAppActionName(executeAction: string): AppActionName | null {
  for (const name of APP_ACTION_NAMES) {
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
