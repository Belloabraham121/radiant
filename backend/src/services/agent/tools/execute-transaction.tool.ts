import { executeTransactionForUser } from "../../chains/execute-transaction.js";
import type { ExecuteTransactionInput, TxResult } from "../../chains/types.js";
import { executeTransactionInputSchema } from "../../chains/types.js";
import { buildExecuteTransactionToolDefinition, staticToolDefinitionsContext } from "./build-tool-definitions.js";

/**
 * Agent tool: `execute_transaction`
 *
 * Contract for Claude / agent runtime — chain-agnostic input; wallet resolved from session.
 * No `wallet` or `wallet_address` in the tool input.
 */
export { EXECUTE_TRANSACTION_TOOL_NAME } from "./build-tool-definitions.js";

/** @deprecated Use `buildExecuteTransactionToolDefinition(context)` for dynamic schemas. */
export const executeTransactionToolDefinition = buildExecuteTransactionToolDefinition(
  staticToolDefinitionsContext(),
);

export async function runExecuteTransactionTool(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<TxResult> {
  return executeTransactionForUser(
    privyUserId,
    executeTransactionInputSchema.parse(input),
  );
}
