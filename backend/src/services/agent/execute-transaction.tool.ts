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
          "deepbook_provision_manager, deepbook_deposit, deepbook_withdraw, swap (alias deepbook_swap), " +
          "deepbook_place_limit_order, deepbook_place_market_order, deepbook_cancel_order, " +
          "deepbook_cancel_orders, deepbook_cancel_all_orders, deepbook_modify_order, " +
          "deepbook_withdraw_settled_amounts, deepbook_withdraw_settled_amounts_permissionless, " +
          "deepbook_flash_loan, deepbook_stake, deepbook_unstake, deepbook_submit_proposal, deepbook_vote.",
      },
      params: {
        type: "object",
        description:
          "Action parameters. transfer_native: { recipient, amount_atomic }. " +
          "deepbook_provision_manager: {} — create on-chain balance manager (gas only, no token deposit). " +
          "deepbook_deposit/withdraw: { coin_key, amount_display } or { coin_key, withdraw_all: true } for full balance. " +
          "swap/deepbook_swap: { pool_key?, amount, side: buy|sell, pay_with_deep?, slippage_bps?, estimated_out_display? }. " +
          "deepbook_place_limit_order: { pool_key?, price, quantity, side: buy|sell, pay_with_deep?, client_order_id? }. " +
          "deepbook_place_market_order: { pool_key?, quantity, side: buy|sell, pay_with_deep?, client_order_id? }. " +
          "deepbook_cancel_order: { pool_key?, order_id }. " +
          "deepbook_cancel_orders: { pool_key?, order_ids: string[] }. " +
          "deepbook_cancel_all_orders: { pool_key? }. " +
          "deepbook_modify_order: { pool_key?, order_id, quantity } — SDK modifies size only, not price. " +
          "deepbook_withdraw_settled_amounts: { pool_key? }. " +
          "deepbook_withdraw_settled_amounts_permissionless: { pool_key? }. " +
          "deepbook_flash_loan: { pool_key?, borrow_amount, asset: base|quote or coin_key matching pool, strategy?: round_trip | swap_chain_repay, steps?: [{ pool_key, side: buy|sell, amount, min_out_display? }], slippage_bps?, repay_source?: swap_output } — " +
          "pool_key is borrow pool; asset base|quote is borrowed side (USDC on SUI_USDC = quote). swap_chain_repay: quote first; steps optional (auto-routed if omitted). Requires allow_flash_loans in Settings. " +
          "deepbook_stake: { pool_key?, amount_display } — stake DEEP from balance manager into pool for fee discounts. Deposit DEEP to manager first if needed. " +
          "deepbook_unstake: { pool_key? } — unstake all active DEEP from the pool back to the balance manager. " +
          "deepbook_submit_proposal: { pool_key?, taker_fee, maker_fee, stake_required } — propose next-epoch trade params; requires Allow governance in Settings and active stake. " +
          "deepbook_vote: { pool_key?, proposal_id } — vote for a proposal by Sui object ID; requires Allow governance in Settings and active stake. " +
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
