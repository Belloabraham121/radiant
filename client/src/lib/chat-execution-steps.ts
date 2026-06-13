import type { ChatToolCall } from "@/lib/chat-api";
import type { AgentChainId } from "@/lib/agent-chains";

export type ExecutionStepStatus = "ok" | "failed" | "skipped" | "warning";

export type ExecutionStep = {
  status: ExecutionStepStatus;
  label: string;
  detail?: string;
  agentTransactionId?: string;
  digest?: string;
  chainId?: AgentChainId;
};

type FlashLoanStepQuote = {
  pool_key: string;
  side: string;
  in_amount: number;
  out_est: number;
  min_out: number;
  input_coin: string;
  output_coin: string;
};

type FlashLoanQuoteResult = {
  strategy: string;
  pool_key: string;
  borrow_amount: number;
  coin_key: string;
  repay_asset: string;
  repay_amount: number;
  repay_feasible: boolean;
  estimated_surplus: number | null;
  steps: FlashLoanStepQuote[];
};

type ToolErrorResult = {
  error: { code?: string; message?: string };
};

function isToolError(result: unknown): result is ToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as ToolErrorResult).error?.message === "string"
  );
}

function isFlashLoanQuote(result: unknown): result is FlashLoanQuoteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "strategy" in result &&
    "repay_feasible" in result &&
    Array.isArray((result as FlashLoanQuoteResult).steps) &&
    !("error" in result)
  );
}

function findLatestFlashLoanQuoteIndex(toolCalls: ChatToolCall[]): number {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const call = toolCalls[i];
    if (call.name === "query_chain" && isFlashLoanQuote(call.result)) {
      return i;
    }
  }
  return -1;
}

function buildFlashLoanExecutionSteps(
  toolCalls: ChatToolCall[],
  quoteIndex: number,
  quote: FlashLoanQuoteResult,
): ExecutionStep[] {
  const steps: ExecutionStep[] = [];

  steps.push({
    status: "ok",
    label: "Quote flash loan",
    detail: `Borrow ${quote.borrow_amount} ${quote.coin_key} from ${quote.pool_key} (${quote.strategy})`,
  });

  for (const [index, step] of quote.steps.entries()) {
    steps.push({
      status: "ok",
      label: `Swap ${index + 1}`,
      detail: `${step.side} ${step.in_amount} ${step.input_coin} → ~${step.out_est} ${step.output_coin} on ${step.pool_key}`,
    });
  }

  const lastStep = quote.steps[quote.steps.length - 1];
  const repayDetail = lastStep
    ? `Need ${quote.repay_amount} ${quote.repay_asset}; last min out ~${lastStep.min_out} ${lastStep.output_coin}`
    : `Need ${quote.repay_amount} ${quote.repay_asset}`;

  if (quote.estimated_surplus != null) {
    const surplusLabel =
      quote.estimated_surplus >= 0
        ? `surplus ~${quote.estimated_surplus} ${quote.coin_key}`
        : `shortfall ~${Math.abs(quote.estimated_surplus)} ${quote.coin_key}`;
    steps.push({
      status: quote.repay_feasible ? "ok" : "failed",
      label: "Repay check",
      detail: `${repayDetail} — ${surplusLabel}`,
    });
  } else {
    steps.push({
      status: quote.repay_feasible ? "ok" : "failed",
      label: "Repay check",
      detail: quote.repay_feasible
        ? `${repayDetail} — feasible at quoted minimums`
        : `${repayDetail} — not feasible at quoted minimums`,
    });
  }

  const executeCall = toolCalls
    .slice(quoteIndex + 1)
    .find((call) => call.name === "execute_transaction");

  if (executeCall) {
    if (isToolError(executeCall.result)) {
      steps.push({
        status: "failed",
        label: "Execute bundle",
        detail: executeCall.result.error.message,
      });
    } else {
      const outcome = executeCall.result as {
        status?: string;
        agent_transaction_id?: string;
        pending?: { id?: string; chain_id?: AgentChainId; action?: string };
        result?: { chain_id?: AgentChainId; digest?: string };
      };

      const agentTransactionId =
        outcome.agent_transaction_id ?? outcome.pending?.id;
      const chainId = outcome.result?.chain_id ?? outcome.pending?.chain_id;
      const meta = {
        ...(agentTransactionId ? { agentTransactionId } : {}),
        ...(chainId ? { chainId } : {}),
      };

      if (outcome.status === "approval_required") {
        steps.push({
          status: "warning",
          label: "Execute bundle",
          detail: "Waiting for your approval in the dialog",
          ...meta,
        });
      } else if (outcome.status === "executed" && outcome.result?.digest) {
        steps.push({
          status: "ok",
          label: "Execute bundle",
          detail: `Broadcast · ${outcome.result.digest.slice(0, 10)}…`,
          digest: outcome.result.digest,
          ...meta,
        });
      }
    }
  } else if (!quote.repay_feasible) {
    steps.push({
      status: "skipped",
      label: "Execute bundle",
      detail: "Blocked — swap outputs would not cover the borrow for atomic repay",
    });
  }

  return steps;
}

function buildSwapExecutionSteps(toolCalls: ChatToolCall[]): ExecutionStep[] | undefined {
  const quoteCall = toolCalls.find(
    (call) =>
      call.name === "query_chain" &&
      !isToolError(call.result) &&
      typeof call.result === "object" &&
      call.result !== null &&
      "input_coin" in call.result &&
      "output_amount_display" in call.result,
  );

  const executeCall = toolCalls.find((call) => call.name === "execute_transaction");
  if (!quoteCall && !executeCall) {
    return undefined;
  }

  const steps: ExecutionStep[] = [];

  if (quoteCall && !isToolError(quoteCall.result)) {
    const quote = quoteCall.result as {
      input_amount_display?: number;
      input_coin?: string;
      output_amount_display?: number;
      output_coin?: string;
      pool_key?: string;
    };
    if (
      quote.input_coin &&
      quote.output_coin &&
      quote.input_amount_display != null &&
      quote.output_amount_display != null
    ) {
      steps.push({
        status: "ok",
        label: "Swap quote",
        detail: `${quote.input_amount_display} ${quote.input_coin} → ~${quote.output_amount_display} ${quote.output_coin}${quote.pool_key ? ` (${quote.pool_key})` : ""}`,
      });
    }
  }

  if (executeCall) {
    if (isToolError(executeCall.result)) {
      steps.push({
        status: "failed",
        label: "Execute swap",
        detail: executeCall.result.error.message,
      });
    } else {
      const outcome = executeCall.result as {
        status?: string;
        agent_transaction_id?: string;
        pending?: { id?: string; chain_id?: AgentChainId };
        result?: { chain_id?: AgentChainId; digest?: string; deepbook?: { swap?: { in_amount_display?: number; input_coin?: string; out_amount_display?: number; output_coin?: string } } };
      };

      const agentTransactionId =
        outcome.agent_transaction_id ?? outcome.pending?.id;
      const chainId = outcome.result?.chain_id ?? outcome.pending?.chain_id;
      const meta = {
        ...(agentTransactionId ? { agentTransactionId } : {}),
        ...(chainId ? { chainId } : {}),
      };

      if (outcome.status === "approval_required") {
        steps.push({
          status: "warning",
          label: "Execute swap",
          detail: "Waiting for your approval in the dialog",
          ...meta,
        });
      } else if (outcome.status === "executed" && outcome.result?.digest) {
        const swap = outcome.result.deepbook?.swap;
        steps.push({
          status: "ok",
          label: "Execute swap",
          detail: swap
            ? `${swap.in_amount_display} ${swap.input_coin} → ${swap.out_amount_display} ${swap.output_coin} · ${outcome.result.digest.slice(0, 10)}…`
            : `Broadcast · ${outcome.result.digest.slice(0, 10)}…`,
          digest: outcome.result.digest,
          ...meta,
        });
      }
    }
  }

  return steps.length > 0 ? steps : undefined;
}

/** Build a step-by-step execution timeline from agent tool calls. */
export function mapToolCallsToExecutionSteps(
  toolCalls: ChatToolCall[],
): ExecutionStep[] | undefined {
  if (toolCalls.length === 0) {
    return undefined;
  }

  const flashQuoteIndex = findLatestFlashLoanQuoteIndex(toolCalls);
  if (flashQuoteIndex >= 0) {
    const quote = toolCalls[flashQuoteIndex].result as FlashLoanQuoteResult;
    return buildFlashLoanExecutionSteps(toolCalls, flashQuoteIndex, quote);
  }

  return buildSwapExecutionSteps(toolCalls);
}

/** Whether failed query_chain pills should be hidden (flash loan timeline covers them). */
export function shouldSuppressQueryFailureReceipts(toolCalls: ChatToolCall[]): boolean {
  const flashQuoteIndex = findLatestFlashLoanQuoteIndex(toolCalls);
  if (flashQuoteIndex < 0) {
    return false;
  }
  const quote = toolCalls[flashQuoteIndex].result as FlashLoanQuoteResult;
  return !quote.repay_feasible;
}
