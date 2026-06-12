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
          "Chain-specific action name. Sui: transfer_native, transfer_sui, execute_bytes, " +
          "deepbook_provision_manager, deepbook_deposit, deepbook_withdraw, swap (alias deepbook_swap).",
      },
      params: {
        type: "object",
        description:
          "Action parameters. transfer_native: { recipient, amount_atomic }. " +
          "deepbook_provision_manager: {} — create on-chain balance manager (gas only, no token deposit). " +
          "deepbook_deposit/withdraw: { coin_key, amount_display } or { coin_key, withdraw_all: true } for full balance. " +
          "swap/deepbook_swap: { pool_key?, amount, side: buy|sell, pay_with_deep?, slippage_bps?, estimated_out_display? }. " +
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
