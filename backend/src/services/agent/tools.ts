import { AppError } from "../../errors/app-error.js";
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
  createPendingTransaction,
  transferRequiresApproval,
} from "./transaction-approval.service.js";

export const agentToolDefinitions = [
  executeTransactionToolDefinition,
  queryChainToolDefinition,
] as const;

export async function runAgentTool(
  privyUserId: string,
  name: string,
  input: Record<string, unknown>,
  options?: { approved?: boolean },
): Promise<unknown> {
  switch (name) {
    case QUERY_CHAIN_TOOL_NAME:
      return runQueryChainTool(privyUserId, input as QueryChainInput);
    case EXECUTE_TRANSACTION_TOOL_NAME:
      return runExecuteTransactionToolWithApproval(
        privyUserId,
        input as ExecuteTransactionInput,
        options?.approved === true,
      );
    default:
      throw new AppError(400, "UNKNOWN_TOOL", `Unknown agent tool: ${name}`);
  }
}

export async function runExecuteTransactionToolWithApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  approved = false,
): Promise<ExecuteToolOutcome> {
  if (!approved && transferRequiresApproval(input)) {
    return {
      status: "approval_required",
      pending: createPendingTransaction(privyUserId, input),
    };
  }

  const result = await runExecuteTransactionTool(privyUserId, input);
  return { status: "executed", result };
}
