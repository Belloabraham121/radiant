import type { ExecuteTransactionInput } from "../../chains/types.js";
import { SWAP_QUOTE_TTL_MS } from "../../defi/deepbook/deepbook-swap.service.js";
import { enrichDeepBookSwapExecuteInputForApproval } from "../../agent-transaction/approval-preview/enrichers/deepbook.js";
import {
  isDeFiQuoteExpired,
  isDeFiQuoteFresh,
  isSwapQuoteExpired,
  isSwapQuoteFresh,
  readDeFiQuoteExpiresAt,
  readQuoteExpiresAt,
} from "../../agent-transaction/approval-preview/quote-expiry.js";

export { SWAP_QUOTE_TTL_MS };
export {
  isDeFiQuoteExpired,
  isDeFiQuoteFresh,
  isSwapQuoteExpired,
  isSwapQuoteFresh,
  readDeFiQuoteExpiresAt,
  readQuoteExpiresAt,
};

/** Attach live swap quote fields before showing the approval dialog. */
export async function enrichSwapExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<ExecuteTransactionInput> {
  return enrichDeepBookSwapExecuteInputForApproval(privyUserId, input);
}
