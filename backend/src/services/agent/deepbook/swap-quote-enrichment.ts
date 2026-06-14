import type { ExecuteTransactionInput } from "../../chains/types.js";
import {
  getDeepBookSwapQuote,
  isDeepBookSwapAction,
  SWAP_QUOTE_TTL_MS,
} from "../../defi/deepbook/deepbook-swap.service.js";

export { SWAP_QUOTE_TTL_MS };

export function readQuoteExpiresAt(params: Record<string, unknown>): string | null {
  const raw = params.quote_expires_at;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function isSwapQuoteExpired(params: Record<string, unknown>, nowMs = Date.now()): boolean {
  const expiresAt = readQuoteExpiresAt(params);
  if (!expiresAt) {
    return false;
  }
  return nowMs >= new Date(expiresAt).getTime();
}

export function isSwapQuoteFresh(params: Record<string, unknown>, nowMs = Date.now()): boolean {
  const expiresAt = readQuoteExpiresAt(params);
  if (!expiresAt) {
    return false;
  }
  return (
    nowMs < new Date(expiresAt).getTime() &&
    typeof params.estimated_out_display === "number"
  );
}

/** Attach live swap quote fields before showing the approval dialog. */
export async function enrichSwapExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<ExecuteTransactionInput> {
  if (!isDeepBookSwapAction(input.action) || input.chain_id !== "sui") {
    return input;
  }

  if (isSwapQuoteFresh(input.params)) {
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
      quoted_at: new Date().toISOString(),
    },
  };
}
