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
  DEPLOY_APP_TOOL_NAME,
  deployAppToolDefinition,
  runDeployAppTool,
} from "../projects/deploy-app.tool.js";
import {
  GENERATE_APP_TOOL_NAME,
  generateAppToolDefinition,
  runGenerateAppTool,
} from "../projects/generate-app.tool.js";
import {
  LIST_SESSION_PROJECTS_TOOL_NAME,
  listSessionProjectsToolDefinition,
  runListSessionProjectsTool,
} from "../projects/list-session-projects.tool.js";
import type { UpdateMemoryInput } from "../memory/agent-memory.types.js";
import {
  UPDATE_MEMORY_TOOL_NAME,
  updateMemoryToolDefinition,
  runUpdateMemoryTool,
} from "./update-memory.tool.js";
import {
  createPendingTransaction,
  transferRequiresApproval,
} from "./transaction-approval.service.js";
import {
  resolveExecuteTransactionOptions,
  type AgentToolOptions,
} from "./execute-transaction-context.js";
import { validateExecuteTransactionInput } from "./deepbook/validate-execute-transaction.js";
import {
  recordAutoExecuted,
  markCompleted,
} from "../agent-transaction/agent-transaction.service.js";
import {
  isDeepBookSwapAction,
  preflightDeepBookSwap,
} from "../defi/deepbook/deepbook-swap.service.js";
import {
  preflightDeepBookPlaceLimitOrder,
  preflightDeepBookPlaceMarketOrder,
  preflightDeepBookModifyOrder,
  preflightDeepBookWithdrawSettled,
  preflightDeepBookWithdrawSettledPermissionless,
} from "../defi/deepbook/deepbook-orders.service.js";
import { preflightDeepBookWithdraw } from "../defi/deepbook/deepbook-balance-manager.service.js";
import {
  isDeepBookFlashLoanAction,
  preflightDeepBookFlashLoan,
} from "../defi/deepbook/deepbook-flash-loan.service.js";

export const agentToolDefinitions = [
  executeTransactionToolDefinition,
  queryChainToolDefinition,
  updateMemoryToolDefinition,
  listSessionProjectsToolDefinition,
  generateAppToolDefinition,
  deployAppToolDefinition,
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
  options?: AgentToolOptions,
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
  options?: AgentToolOptions,
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
          options,
        );
      case UPDATE_MEMORY_TOOL_NAME:
        return await runUpdateMemoryTool(privyUserId, input as UpdateMemoryInput);
      case LIST_SESSION_PROJECTS_TOOL_NAME:
        return await runListSessionProjectsTool(privyUserId, input, {
          sessionId: options?.sessionId,
        });
      case GENERATE_APP_TOOL_NAME:
        return await runGenerateAppTool(privyUserId, input, {
          sessionId: options?.sessionId,
          rawArguments: options?.rawArguments,
        });
      case DEPLOY_APP_TOOL_NAME:
        return await runDeployAppTool(privyUserId, input);
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
  options?: AgentToolOptions,
): Promise<unknown> {
  return dispatchAgentTool(privyUserId, name, input, options);
}

export async function runExecuteTransactionToolWithApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options: AgentToolOptions | boolean = {},
): Promise<ExecuteToolOutcome> {
  const opts = resolveExecuteTransactionOptions(options);
  const approved = opts.approved === true;
  const context = {
    sessionId: opts.sessionId,
    messageId: opts.messageId,
    workflowStepIndex: opts.workflowStepIndex,
  };

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
      if (isDeepBookFlashLoanAction(input.action)) {
        await preflightDeepBookFlashLoan(privyUserId, input.params);
      }
      const pending = await createPendingTransaction(privyUserId, input, context);
      return {
        status: "approval_required",
        pending,
        agent_transaction_id: pending.id,
      };
    }
  }

  let transactionId: string | undefined;
  try {
    const row = await recordAutoExecuted({
      privyUserId,
      sessionId: context.sessionId,
      messageId: context.messageId,
      workflowStepIndex: context.workflowStepIndex,
      input,
    });
    transactionId = row.id;
  } catch (err) {
    console.warn("Failed to record auto-executed agent transaction", err);
  }

  try {
    const result = await runExecuteTransactionTool(privyUserId, input);
    if (transactionId) {
      await markCompleted(transactionId, { kind: "success", result }).catch(() => undefined);
    }
    return {
      status: "executed",
      result,
      ...(transactionId ? { agent_transaction_id: transactionId } : {}),
    };
  } catch (err) {
    if (transactionId) {
      const error = mapAgentToolError(err);
      await markCompleted(transactionId, {
        kind: "failure",
        error: { code: error.code, message: error.message },
      }).catch(() => undefined);
    }
    throw err;
  }
}
