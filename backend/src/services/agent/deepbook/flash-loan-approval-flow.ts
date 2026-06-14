import type { FlashLoanBundleQuoteResult } from "../../defi/deepbook/deepbook-flash-loan.types.js";
import { FLASH_LOAN_REPAY_INFEASIBLE_CODE } from "../../defi/deepbook/deepbook-flash-loan.types.js";
import type { ToolCallRecord } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";

function isToolErrorResult(
  result: unknown,
): result is { error: { code?: string; message?: string } } {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as { error?: { message?: string } }).error?.message === "string"
  );
}

export function isFlashLoanQuoteResult(result: unknown): result is FlashLoanBundleQuoteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "strategy" in result &&
    "repay_feasible" in result &&
    "steps" in result &&
    !("error" in result)
  );
}

export const FLASH_LOAN_QUOTE_INFEASIBLE_BLOCK_CODE = "FLASH_LOAN_QUOTE_INFEASIBLE";
export const FLASH_LOAN_RESEARCH_EXECUTE_BLOCK_CODE = "FLASH_LOAN_RESEARCH_EXECUTE";

export { FLASH_LOAN_REPAY_INFEASIBLE_CODE };

function isInfeasibleQuoteExecuteBlock(result: unknown): boolean {
  return (
    isToolErrorResult(result) &&
    result.error?.code === FLASH_LOAN_QUOTE_INFEASIBLE_BLOCK_CODE
  );
}

function isResearchExecuteBlock(result: unknown): boolean {
  return (
    isToolErrorResult(result) &&
    result.error?.code === FLASH_LOAN_RESEARCH_EXECUTE_BLOCK_CODE
  );
}

function isBlockedFlashLoanExecuteAttempt(result: unknown): boolean {
  return isInfeasibleQuoteExecuteBlock(result) || isResearchExecuteBlock(result);
}

/** True when this turn attempted on-chain flash loan execution (not quote-only research). */
export function hasFlashLoanExecutionAttempt(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => {
    if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME) {
      return false;
    }
    if (isBlockedFlashLoanExecuteAttempt(call.result)) {
      return false;
    }
    return true;
  });
}

/** Quote fetched for strategy/feasibility exploration — no execute_transaction in this turn. */
export function isFlashLoanAdvisoryTurn(toolCalls: ToolCallRecord[]): boolean {
  return findLatestFlashLoanQuote(toolCalls) !== null && !hasFlashLoanExecutionAttempt(toolCalls);
}

/** Canned quote text is for blocked or in-flight execution — not advisory research replies. */
export function shouldUseCannedFlashLoanQuoteReply(
  toolCalls: ToolCallRecord[],
  quote: FlashLoanBundleQuoteResult,
): boolean {
  if (isFlashLoanAdvisoryTurn(toolCalls)) {
    return false;
  }
  if (!quote.repay_feasible) {
    return true;
  }
  return hasFlashLoanExecutionAttempt(toolCalls);
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
  if (hasPending || isFlashLoanAdvisoryTurn(toolCalls)) {
    return null;
  }

  const quote = findLatestFlashLoanQuote(toolCalls);
  if (!quote?.repay_feasible) {
    return quote;
  }

  return null;
}

export function buildInfeasibleFlashLoanExecuteBlock(
  quote: FlashLoanBundleQuoteResult,
): { error: { code: string; message: string } } {
  return {
    error: {
      code: FLASH_LOAN_QUOTE_INFEASIBLE_BLOCK_CODE,
      message:
        `Flash loan repay is not feasible at quoted minimums (surplus ${quote.estimated_surplus ?? "unknown"} ${quote.coin_key}). ` +
        "Do not execute — explain the strategy, pools, and quote data to the user.",
    },
  };
}

export function buildFlashLoanResearchExecuteBlock(): { error: { code: string; message: string } } {
  return {
    error: {
      code: FLASH_LOAN_RESEARCH_EXECUTE_BLOCK_CODE,
      message:
        "The user asked for a flash-loan strategy or feasibility analysis — do not execute. " +
        "Answer in prose with pools, routes, trade-offs, and quote data. Invite them to say when to run it.",
    },
  };
}

export function isFlashLoanRepayInfeasibleErrorCode(code: string | undefined): boolean {
  return code === FLASH_LOAN_REPAY_INFEASIBLE_CODE;
}

export function isFlashLoanToolContext(
  toolName: string,
  toolInput: Pick<ToolCallRecord, "query" | "action">,
): boolean {
  if (toolName === EXECUTE_TRANSACTION_TOOL_NAME && toolInput.action === "deepbook_flash_loan") {
    return true;
  }
  if (toolName === QUERY_CHAIN_TOOL_NAME && toolInput.query === "flash_loan_quote") {
    return true;
  }
  return false;
}

export function isFlashLoanToolValidationError(
  toolName: string,
  toolInput: Pick<ToolCallRecord, "query" | "action">,
  errorCode: string | undefined,
): boolean {
  return errorCode === "VALIDATION_ERROR" && isFlashLoanToolContext(toolName, toolInput);
}

function isSwapQuoteResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "input_coin" in result &&
    "output_amount_display" in result &&
    !("error" in result) &&
    !("strategy" in result)
  );
}

function findLatestFlashLoanQuoteIndex(toolCalls: ToolCallRecord[]): number {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const call = toolCalls[i];
    if (call.name === QUERY_CHAIN_TOOL_NAME && isFlashLoanQuoteResult(call.result)) {
      return i;
    }
  }
  return -1;
}

function hasFlashLoanValidationFailure(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => {
    if (!isToolErrorResult(call.result)) {
      return false;
    }
    return isFlashLoanToolValidationError(call.name, call, call.result.error?.code);
  });
}

function isFlashLoanFlowContext(toolCalls: ToolCallRecord[]): boolean {
  const quoteIndex = findLatestFlashLoanQuoteIndex(toolCalls);
  const quote = quoteIndex >= 0 ? toolCalls[quoteIndex].result : null;
  const infeasibleQuote =
    quote && isFlashLoanQuoteResult(quote) && !quote.repay_feasible && quoteIndex >= 0;

  if (infeasibleQuote || hasFlashLoanValidationFailure(toolCalls)) {
    return true;
  }

  return toolCalls.some((call) => {
    if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME || !isToolErrorResult(call.result)) {
      return false;
    }
    return isFlashLoanToolValidationError(call.name, call, call.result.error?.code);
  });
}

/** Drop noisy failed query_chain calls after an infeasible flash loan quote. */
export function filterToolCallsForClientDisplay(
  toolCalls: ToolCallRecord[],
): ToolCallRecord[] {
  const quote = findLatestFlashLoanQuote(toolCalls);
  const quoteIndex = findLatestFlashLoanQuoteIndex(toolCalls);
  const infeasibleQuote = quote && !quote.repay_feasible && quoteIndex >= 0;
  const validationFailure = hasFlashLoanValidationFailure(toolCalls);
  const flashLoanContext = isFlashLoanFlowContext(toolCalls);

  if (!infeasibleQuote && !validationFailure && !flashLoanContext) {
    return toolCalls;
  }

  let keepFailedQuery = validationFailure && quoteIndex < 0;

  return toolCalls.filter((call, index) => {
    if (call.name === EXECUTE_TRANSACTION_TOOL_NAME) {
      if (isBlockedFlashLoanExecuteAttempt(call.result) && isFlashLoanAdvisoryTurn(toolCalls)) {
        return false;
      }
      return true;
    }
    if (call.name !== QUERY_CHAIN_TOOL_NAME) {
      return true;
    }
    if (isSwapQuoteResult(call.result)) {
      return !flashLoanContext;
    }
    if (isFlashLoanQuoteResult(call.result)) {
      return true;
    }
    if (isToolErrorResult(call.result)) {
      if (infeasibleQuote && index > quoteIndex) {
        return false;
      }
      if (validationFailure) {
        if (keepFailedQuery) {
          keepFailedQuery = false;
          return true;
        }
        return false;
      }
    }
    return true;
  });
}

export function isInfeasibleFlashLoanQuoteResult(
  result: unknown,
): result is FlashLoanBundleQuoteResult {
  return isFlashLoanQuoteResult(result) && !result.repay_feasible;
}
