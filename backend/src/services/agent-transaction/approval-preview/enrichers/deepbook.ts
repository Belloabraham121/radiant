import type { ExecuteTransactionInput } from "../../../chains/types.js";
import {
  getDeepBookSwapQuote,
  isDeepBookSwapAction,
} from "../../../defi/deepbook/deepbook-swap.service.js";
import { isDeFiQuoteFresh } from "../quote-expiry.js";

export function matchDeepBookSwapExecuteInput(input: ExecuteTransactionInput): boolean {
  return isDeepBookSwapAction(input.action) && input.chain_id === "sui";
}

/** Attach live DeepBook swap quote fields before showing the approval dialog. */
export async function enrichDeepBookSwapExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<ExecuteTransactionInput> {
  if (!matchDeepBookSwapExecuteInput(input)) {
    return input;
  }

  if (isDeFiQuoteFresh(input.params)) {
    return input;
  }

  const quote = await getDeepBookSwapQuote(privyUserId, input.params);

  return {
    ...input,
    params: {
      ...input.params,
      input_coin: quote.input_coin,
      output_coin: quote.output_coin,
      estimated_out_display: quote.output_amount_display,
      min_out_display: quote.min_out_display,
      quote_expires_at: quote.expires_at,
      expires_at: quote.expires_at,
      quoted_at: new Date().toISOString(),
    },
  };
}
