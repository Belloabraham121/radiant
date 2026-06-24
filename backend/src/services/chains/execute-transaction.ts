import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import { getDefaultAgentChainId } from "../../config/chains.js";
import { consumeStellarExecuteQuota } from "./stellar-execute-rate-limit.js";
import { getAdapter } from "./registry.js";
import type { ExecuteTransactionInput, ExecuteTransactionInputParsed, TxResult } from "./types.js";
import { executeTransactionInputSchema } from "./types.js";

export function parseExecuteTransactionInput(
  input: ExecuteTransactionInput,
): ExecuteTransactionInputParsed {
  return executeTransactionInputSchema.parse(input);
}

/**
 * Chain-agnostic transaction execution — used by agent tools and wallet routes.
 * Resolves the adapter from `chain_id`; no chain SDK imports here.
 */
export async function executeTransactionForUser(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<TxResult> {
  try {
    const parsed = parseExecuteTransactionInput(input);
    if (parsed.chain_id === "stellar") {
      await consumeStellarExecuteQuota(privyUserId);
    }
    const adapter = getAdapter(parsed.chain_id);
    return await adapter.executeTransaction(privyUserId, parsed.action, parsed.params);
  } catch (err) {
    throw mapAgentToolError(err);
  }
}

export async function executeTransactionForUserOnDefaultChain(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<TxResult> {
  return executeTransactionForUser(privyUserId, {
    chain_id: getDefaultAgentChainId(),
    action,
    params,
  });
}
