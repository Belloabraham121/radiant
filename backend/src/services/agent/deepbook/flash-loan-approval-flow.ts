import type { FlashLoanBundleQuoteResult } from "../../defi/deepbook/deepbook-flash-loan.types.js";
import type { ToolCallRecord } from "../agent.types.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";

function isFlashLoanQuoteResult(result: unknown): result is FlashLoanBundleQuoteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "strategy" in result &&
    "repay_feasible" in result &&
    "steps" in result &&
    !("error" in result)
  );
}

export function findLatestFlashLoanQuote(
  toolCalls: ToolCallRecord[],
): FlashLoanBundleQuoteResult | null {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const call = toolCalls[i];
    if (call.name === QUERY_CHAIN_TOOL_NAME && isFlashLoanQuoteResult(call.result)) {
      return call.result;
    }
  }
  return null;
}

/** Human-readable chat reply from a flash_loan_quote tool result. */
export function formatFlashLoanQuoteReply(quote: FlashLoanBundleQuoteResult): string {
  const stepLines = quote.steps.map(
    (step, index) =>
      `Step ${index + 1}: ${step.side} ${step.in_amount} ${step.input_coin} → ~${step.out_est} ${step.output_coin} on ${step.pool_key}`,
  );

  const lines = [
    `Flash loan quote (${quote.strategy}) — borrow ${quote.borrow_amount} ${quote.coin_key} from ${quote.pool_key}.`,
    ...stepLines,
    `Repay feasible at quoted mins: ${quote.repay_feasible ? "yes" : "no"}.`,
  ];

  if (quote.estimated_surplus != null) {
    lines.push(`Estimated surplus: ${quote.estimated_surplus} ${quote.coin_key}.`);
  }

  if (quote.warnings.length > 0) {
    lines.push(`Warnings: ${quote.warnings.join(" ")}`);
  }

  if (!quote.repay_feasible) {
    lines.push(
      "I can't execute this bundle — swap outputs wouldn't cover the borrow for an atomic repay. " +
        "Try a smaller amount, a different route, or wait for better prices.",
    );
  }

  return lines.join("\n");
}

export function shouldFinalizeFlashLoanQuoteReply(
  toolCalls: ToolCallRecord[],
  hasPending: boolean,
): FlashLoanBundleQuoteResult | null {
  if (hasPending) {
    return null;
  }

  const quote = findLatestFlashLoanQuote(toolCalls);
  if (!quote?.repay_feasible) {
    return quote;
  }

  return null;
}

export function isFlashLoanRepayNotFeasibleError(message: string): boolean {
  return /repay is not feasible|repay_feasible:\s*false/i.test(message);
}
