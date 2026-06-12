import { executeTransactionForUser } from "../chains/execute-transaction.js";
import type { ExecuteTransactionInput, TxResult } from "../chains/types.js";
import { executeTransactionInputSchema } from "../chains/types.js";

/**
 * Agent tool: `execute_transaction`
 *
 * Contract for Claude / agent runtime — chain-agnostic input; wallet resolved from session.
 * No `wallet` or `wallet_address` in the tool input.
 */
export const EXECUTE_TRANSACTION_TOOL_NAME = "execute_transaction" as const;

export const executeTransactionToolDefinition = {
  name: EXECUTE_TRANSACTION_TOOL_NAME,
  description:
    "Sign and broadcast a transaction on the user's agent wallet for the given chain. " +
    "The wallet is resolved from the authenticated session — never pass wallet addresses.",
  input_schema: {
    type: "object" as const,
    properties: {
      chain_id: {
        type: "string",
        enum: ["sui", "ethereum", "solana"],
        description: "Target chain (must be enabled for this app).",
      },
      action: {
        type: "string",
        description:
          "Chain-specific action name. Sui: transfer_native, transfer_sui, execute_bytes, deepbook_deposit, deepbook_withdraw.",
      },
      params: {
        type: "object",
        description:
          "Action parameters. transfer_native: { recipient, amount_atomic }. " +
          "deepbook_deposit/withdraw: { coin_key, amount_display } (or amount_atomic). " +
          "execute_bytes: { transaction_bytes } (base64).",
        additionalProperties: true,
      },
    },
    required: ["chain_id", "action", "params"] as const,
    additionalProperties: false,
  },
};

export async function runExecuteTransactionTool(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<TxResult> {
  return executeTransactionForUser(privyUserId, executeTransactionInputSchema.parse(input));
}
