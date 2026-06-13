import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { ExecuteToolOutcome, QueryChainInput } from "./agent.types.js";
import {
  EXECUTE_TRANSACTION_TOOL_NAME,
  executeTransactionToolDefinition,
  runExecuteTransactionTool,
} from "./execute-transaction.tool.js";
import {
  QUERY_CHAIN_TOOL_NAME,
  queryChainToolDefinition,
  runQueryChainTool,
} from "./query-chain.tool.js";
import {
  UPDATE_MEMORY_TOOL_NAME,
  updateMemoryToolDefinition,
  runUpdateMemoryTool,
} from "./update-memory.tool.js";
import type { UpdateMemoryInput } from "../memory/agent-memory.types.js";
import {
  createPendingTransaction,
  transferRequiresApproval,
} from "./transaction-approval.service.js";
import { validateExecuteTransactionInput } from "./validate-execute-transaction.js";
import {
  isDeepBookSwapAction,
  preflightDeepBookSwap,
} from "../defi/deepbook-swap.service.js";
import {
  isDeepBookPlaceOrderAction,
  preflightDeepBookPlaceLimitOrder,
  preflightDeepBookPlaceMarketOrder,
  preflightDeepBookModifyOrder,
  preflightDeepBookWithdrawSettled,
  preflightDeepBookWithdrawSettledPermissionless,
} from "../defi/deepbook-orders.service.js";
import { preflightDeepBookWithdraw } from "../defi/deepbook-balance-manager.service.js";

export const agentToolDefinitions = [
  executeTransactionToolDefinition,
  queryChainToolDefinition,
  updateMemoryToolDefinition,
] as const;

export type AgentToolErrorResult = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

function toToolErrorResult(err: AppError): AgentToolErrorResult {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
}

type AgentToolHandler = (
  privyUserId: string,
  name: string,
  input: Record<string, unknown>,
  options?: { approved?: boolean },
) => Promise<unknown>;

let agentToolHandler: AgentToolHandler | null = null;

/** Test hook — inject tool handler for workflow/orchestration tests. */
export function setAgentToolHandlerForTests(handler: AgentToolHandler | null): void {
  agentToolHandler = handler;
}

async function dispatchAgentTool(
  privyUserId: string,
  name: string,
  input: Record<string, unknown>,
  options?: { approved?: boolean },
): Promise<unknown> {
  if (agentToolHandler) {
    return agentToolHandler(privyUserId, name, input, options);
  }

  try {
    switch (name) {
      case QUERY_CHAIN_TOOL_NAME:
        return await runQueryChainTool(privyUserId, input as QueryChainInput);
      case EXECUTE_TRANSACTION_TOOL_NAME:
        return await runExecuteTransactionToolWithApproval(
          privyUserId,
          input as ExecuteTransactionInput,
          options?.approved === true,
        );
      case UPDATE_MEMORY_TOOL_NAME:
        return await runUpdateMemoryTool(privyUserId, input as UpdateMemoryInput);
      default:
        throw new AppError(400, "UNKNOWN_TOOL", `Unknown agent tool: ${name}`);
    }
  } catch (err) {
    return toToolErrorResult(mapAgentToolError(err));
  }
}

export async function runAgentTool(
  privyUserId: string,
  name: string,
  input: Record<string, unknown>,
  options?: { approved?: boolean },
): Promise<unknown> {
  return dispatchAgentTool(privyUserId, name, input, options);
}

export async function runExecuteTransactionToolWithApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  approved = false,
): Promise<ExecuteToolOutcome> {
  validateExecuteTransactionInput(input);

  if (!approved) {
    const needsApproval = await transferRequiresApproval(privyUserId, input);
    if (needsApproval) {
      if (isDeepBookSwapAction(input.action)) {
        await preflightDeepBookSwap(privyUserId, input.params);
      }
      if (input.action === "deepbook_place_limit_order") {
        await preflightDeepBookPlaceLimitOrder(privyUserId, input.params);
      }
      if (input.action === "deepbook_place_market_order") {
        await preflightDeepBookPlaceMarketOrder(privyUserId, input.params);
      }
      if (input.action === "deepbook_modify_order") {
        await preflightDeepBookModifyOrder(privyUserId, input.params);
      }
      if (input.action === "deepbook_withdraw_settled_amounts") {
        await preflightDeepBookWithdrawSettled(privyUserId, input.params);
      }
      if (input.action === "deepbook_withdraw_settled_amounts_permissionless") {
        await preflightDeepBookWithdrawSettledPermissionless(privyUserId, input.params);
      }
      if (input.action === "deepbook_withdraw") {
        await preflightDeepBookWithdraw(privyUserId, input.params);
      }
      return {
        status: "approval_required",
        pending: await createPendingTransaction(privyUserId, input),
      };
    }
  }

  const result = await runExecuteTransactionTool(privyUserId, input);
  return { status: "executed", result };
}
