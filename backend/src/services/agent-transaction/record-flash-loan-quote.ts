import type { ToolCallRecord } from "../agent/agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../agent/execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../agent/query-chain.tool.js";
import {
  findLatestFlashLoanQuote,
  isFlashLoanQuoteResult,
} from "../agent/deepbook/flash-loan-approval-flow.js";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import type {
  FlashLoanBundleQuoteResult,
  FlashLoanStepQuote,
} from "../defi/deepbook/deepbook-flash-loan.types.js";
import { fmtDisplayNumber } from "../../utils/format-display-number.js";
import { categorizeAgentTransactionAction } from "./deepbook/categorize-action.js";
import { createAgentTransaction } from "./agent-transaction.repository.js";

export const FLASH_LOAN_REPAY_NOT_FEASIBLE_CODE = "REPAY_NOT_FEASIBLE";

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}

async function resolveWalletAddress(privyUserId: string): Promise<string> {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  if (!wallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", 'No agent wallet registered for chain "sui"');
  }
  return wallet.address;
}

export type RecordInfeasibleFlashLoanQuoteInput = {
  privyUserId: string;
  sessionId: string;
  messageId?: string;
  quote: FlashLoanBundleQuoteResult;
};

function flashLoanStepToParams(step: FlashLoanStepQuote) {
  return {
    pool_key: step.pool_key,
    side: step.side,
    amount: step.in_amount,
  };
}

export function flashLoanQuoteToExecuteParams(
  quote: FlashLoanBundleQuoteResult,
): Record<string, unknown> {
  return {
    pool_key: quote.pool_key,
    borrow_amount: quote.borrow_amount,
    asset: quote.asset,
    strategy: quote.strategy,
    ...(quote.steps.length > 0
      ? { steps: quote.steps.map(flashLoanStepToParams) }
      : {}),
  };
}

export function buildFlashLoanQuoteFailureMessage(quote: FlashLoanBundleQuoteResult): string {
  if (quote.estimated_surplus != null && quote.estimated_surplus < 0) {
    return (
      `Repay not feasible at quoted minimums — shortfall ~${fmtDisplayNumber(Math.abs(quote.estimated_surplus))} ${quote.coin_key}`
    );
  }

  const lastStep = quote.steps[quote.steps.length - 1];
  if (lastStep) {
    return (
      `Repay not feasible at quoted minimums — need ${fmtDisplayNumber(quote.repay_amount)} ${quote.repay_asset}, ` +
      `last min out ~${fmtDisplayNumber(lastStep.min_out)} ${lastStep.output_coin}`
    );
  }

  return "Repay not feasible at quoted minimums — swap outputs would not cover the borrow for atomic repay";
}

export function buildFlashLoanQuoteLedgerDisplay(quote: FlashLoanBundleQuoteResult): {
  title: string;
  amount_display: string;
} {
  if (quote.strategy === "swap_chain_repay" && quote.steps.length > 0) {
    const route = quote.steps
      .map(
        (step) =>
          `${step.side} ${fmtDisplayNumber(step.in_amount)} ${step.input_coin} → ~${fmtDisplayNumber(step.out_est)} ${step.output_coin}`,
      )
      .join(" → ");
    const surplus =
      quote.estimated_surplus != null && quote.estimated_surplus < 0
        ? ` · shortfall ~${fmtDisplayNumber(Math.abs(quote.estimated_surplus))} ${quote.coin_key}`
        : "";

    return {
      title: `Flash loan bundle blocked (${quote.pool_key})`,
      amount_display: `Borrow ${fmtDisplayNumber(quote.borrow_amount)} ${quote.coin_key} → ${route} → repay ${fmtDisplayNumber(quote.borrow_amount)} ${quote.coin_key}${surplus}`,
    };
  }

  return {
    title: `Flash loan blocked (${quote.pool_key})`,
    amount_display: `Borrow ${fmtDisplayNumber(quote.borrow_amount)} ${quote.coin_key} (${quote.strategy})`,
  };
}

function hasFlashLoanExecuteAttemptAfterQuote(
  toolCalls: ToolCallRecord[],
  quoteIndex: number,
): boolean {
  return toolCalls.slice(quoteIndex + 1).some((call) => {
    if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME) {
      return false;
    }
    if (
      typeof call.result === "object" &&
      call.result !== null &&
      "status" in call.result
    ) {
      const status = (call.result as { status?: string }).status;
      return status === "approval_required" || status === "executed";
    }
    return false;
  });
}

export async function recordInfeasibleFlashLoanQuote(
  input: RecordInfeasibleFlashLoanQuoteInput,
): Promise<string> {
  const userId = await requireUserId(input.privyUserId);
  const walletAddress = await resolveWalletAddress(input.privyUserId);
  const display = buildFlashLoanQuoteLedgerDisplay(input.quote);
  const params = flashLoanQuoteToExecuteParams(input.quote);
  const errorMessage = buildFlashLoanQuoteFailureMessage(input.quote);
  const now = new Date();

  const row = await createAgentTransaction({
    user_id: userId,
    session_id: input.sessionId,
    message_id: input.messageId ?? null,
    chain_id: "sui",
    wallet_address: walletAddress,
    action: "deepbook_flash_loan",
    params,
    category: categorizeAgentTransactionAction("deepbook_flash_loan"),
    title: display.title,
    amount_display: display.amount_display,
    status: "failure",
    result: {
      flash_loan_quote: input.quote,
      blocked: true,
      reason: "repay_not_feasible",
    },
    error_code: FLASH_LOAN_REPAY_NOT_FEASIBLE_CODE,
    error_message: errorMessage,
    completed_at: now,
  });

  return row.id;
}

/** Persist a blocked flash loan bundle when repay is infeasible and execute never ran. */
export async function recordInfeasibleFlashLoanQuotesFromToolCalls(
  privyUserId: string,
  sessionId: string,
  toolCalls: ToolCallRecord[],
  messageId?: string,
): Promise<ToolCallRecord[]> {
  const quote = findLatestFlashLoanQuote(toolCalls);
  if (!quote || quote.repay_feasible) {
    return toolCalls;
  }

  const quoteIndex = (() => {
    for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
      const call = toolCalls[i];
      if (call.name === QUERY_CHAIN_TOOL_NAME && isFlashLoanQuoteResult(call.result)) {
        return i;
      }
    }
    return -1;
  })();
  if (quoteIndex < 0) {
    return toolCalls;
  }

  if (hasFlashLoanExecuteAttemptAfterQuote(toolCalls, quoteIndex)) {
    return toolCalls;
  }

  const transactionId = await recordInfeasibleFlashLoanQuote({
    privyUserId,
    sessionId,
    messageId,
    quote,
  });

  return toolCalls.map((call, index) => {
    if (index !== quoteIndex || !isFlashLoanQuoteResult(call.result)) {
      return call;
    }
    return {
      ...call,
      result: {
        ...call.result,
        agent_transaction_id: transactionId,
      },
    };
  });
}
