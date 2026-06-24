import type { ExecuteTransactionInput } from "../../../chains/types.js";
import {
  isLifiExecuteAction,
} from "../../../agent/chains/evm/lifi/execute-actions.js";
import { isDeFiQuoteFresh } from "../quote-expiry.js";
import {
  isLifiApprovalDisplayComplete,
  resolveLifiApprovalParams,
} from "./lifi-route-params.js";

export function matchLifiExecuteInput(input: ExecuteTransactionInput): boolean {
  return isLifiExecuteAction(input.action);
}

/** Attach cross-chain quote display fields before showing the approval dialog. */
export async function enrichLifiExecuteInputForApproval(
  _privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<ExecuteTransactionInput> {
  if (!matchLifiExecuteInput(input)) {
    return input;
  }

  if (isDeFiQuoteFresh(input.params) && isLifiApprovalDisplayComplete(input.params)) {
    return input;
  }

  const params = await resolveLifiApprovalParams(input.params, { privyUserId: _privyUserId });
  return { ...input, params };
}
