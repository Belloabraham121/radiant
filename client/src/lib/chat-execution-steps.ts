import type { ChatToolCall } from "@/lib/chat-api";
import type { AgentChainId } from "@/lib/agent-chains";
import { sanitizeToolErrorMessage } from "@/lib/sanitize-tool-error";

export type ExecutionStepStatus =
  | "pending"
  | "running"
  | "ok"
  | "failed"
  | "skipped"
  | "warning";

export type ExecutionStep = {
  id: string;
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
  agent_transaction_id?: string;
};

type ToolErrorResult = {
  error: { code?: string; message?: string };
};

const FLASH_LOAN_QUOTE_INFEASIBLE_BLOCK_CODE = "FLASH_LOAN_QUOTE_INFEASIBLE";

function isBlockedInfeasibleFlashLoanExecute(call: ChatToolCall): boolean {
  return (
    call.name === "execute_transaction" &&
    isToolError(call.result) &&
    call.result.error.code === FLASH_LOAN_QUOTE_INFEASIBLE_BLOCK_CODE
  );
}

function hasFlashLoanExecutionAttemptInTurn(
  toolCalls: ChatToolCall[],
): boolean {
  return toolCalls.some(
    (call) =>
      call.name === "execute_transaction" &&
      !isBlockedInfeasibleFlashLoanExecute(call),
  );
}

export type StreamExecutionStepPayload = {
  id: string;
  status: ExecutionStepStatus;
  label: string;
  detail?: string;
  agent_transaction_id?: string;
  digest?: string;
  chain_id?: string;
  status_category?: import("@/lib/agent-status-category").AgentStatusCategory;
};

const EXECUTION_TIMELINE_TOOL_NAMES = new Set([
  "execute_transaction",
  "call_app_action",
  "query_chain",
]);

/** Whether this turn should show the on-chain execution timeline (swaps, flash loans, etc.). */
export function isExecutionTimelineRelevant(
  toolCalls: ChatToolCall[],
): boolean {
  return toolCalls.some((call) => EXECUTION_TIMELINE_TOOL_NAMES.has(call.name));
}

/** Drop generic agent-planning pulses when no transaction tools ran. */
export function filterExecutionStepsForDisplay(
  steps: ExecutionStep[],
  toolCalls: ChatToolCall[],
): ExecutionStep[] {
  if (isExecutionTimelineRelevant(toolCalls)) {
    return steps;
  }
  return steps.filter((step) => step.id !== "agent");
}

export function mapStreamStepToExecutionStep(
  step: StreamExecutionStepPayload,
): ExecutionStep {
  const chainId = (step.chain_id ?? (step.digest ? "sui" : undefined)) as
    | AgentChainId
    | undefined;
  return {
    id: step.id,
    status: step.status,
    label: step.label,
    detail: step.detail,
    ...(step.agent_transaction_id
      ? { agentTransactionId: step.agent_transaction_id }
      : {}),
    ...(step.digest ? { digest: step.digest } : {}),
    ...(chainId ? { chainId } : {}),
  };
}

export function upsertExecutionStep(
  steps: ExecutionStep[],
  incoming: ExecutionStep,
): ExecutionStep[] {
  const index = steps.findIndex((step) => step.id === incoming.id);
  if (index === -1) {
    return [...steps, incoming];
  }
  const next = [...steps];
  next[index] = { ...next[index], ...incoming };
  return next;
}

export const EXECUTION_STEP_ORDER = [
  "agent",
  "quote",
  "swap-1",
  "swap-2",
  "swap-3",
  "swap-quote",
  "repay",
  "execute",
] as const;

export function sortExecutionSteps(steps: ExecutionStep[]): ExecutionStep[] {
  return normalizeExecutionSteps(
    [...steps].sort((a, b) => {
      const indexA = EXECUTION_STEP_ORDER.indexOf(
        a.id as (typeof EXECUTION_STEP_ORDER)[number],
      );
      const indexB = EXECUTION_STEP_ORDER.indexOf(
        b.id as (typeof EXECUTION_STEP_ORDER)[number],
      );
      const rankA = indexA === -1 ? 100 : indexA;
      const rankB = indexB === -1 ? 100 : indexB;
      if (rankA !== rankB) return rankA - rankB;
      return a.id.localeCompare(b.id);
    }),
  );
}

/** Update the execute step when the preview iframe reports an app action outcome. */
export function executionStepFromPreviewResult(input: {
  action: string;
  status: "executed" | "approval_required" | "error";
  digest?: string;
  message?: string;
}): ExecutionStep {
  const label = `Execute ${input.action.replace(/_/g, " ")}`;
  if (input.status === "executed") {
    return {
      id: "execute",
      status: "ok",
      label,
      detail: input.digest
        ? `Broadcast · ${input.digest.slice(0, 10)}…`
        : "Completed in app",
      digest: input.digest,
    };
  }
  if (input.status === "approval_required") {
    return {
      id: "execute",
      status: "warning",
      label,
      detail: "Waiting for your approval in the app",
    };
  }
  return {
    id: "execute",
    status: "failed",
    label,
    detail: input.message ?? "Action failed in preview",
  };
}

export function isFlashLoanParamValidationError(message: string): boolean {
  return /params\.(steps|amount|borrow_amount)|steps\[\d+\]|swap_chain_repay|borrow_amount|deepbook_flash_loan|must be a positive number|Step \d+ must spend|Final swap must output/i.test(
    message,
  );
}

function isFlashLoanFlow(steps: ExecutionStep[]): boolean {
  return steps.some(
    (step) => step.id === "quote" || step.id.startsWith("swap-"),
  );
}

/** Drop noise and fix execute/quote pairing for flash loan turns. */
export function normalizeExecutionSteps(
  steps: ExecutionStep[],
): ExecutionStep[] {
  let next = [...steps];

  if (isFlashLoanFlow(next)) {
    next = next.filter((step) => step.id !== "swap-quote");
  }

  const quoteFailed = next.some(
    (step) => step.id === "quote" && step.status === "failed",
  );
  if (quoteFailed) {
    next = next.filter((step) => !step.id.startsWith("query-failed"));
  }

  const quote = next.find((step) => step.id === "quote");
  const execute = next.find((step) => step.id === "execute");

  if (
    quote?.status === "failed" &&
    execute &&
    (execute.status === "failed" || execute.status === "running") &&
    execute.detail &&
    isFlashLoanParamValidationError(execute.detail)
  ) {
    next = upsertExecutionStep(next, {
      id: "execute",
      status: "skipped",
      label: "Execute bundle",
      detail: "Blocked — fix the flash loan route before executing",
    });
  }

  return next;
}

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
    id: "quote",
    status: "ok",
    label: "Quote flash loan",
    detail: `Borrow ${quote.borrow_amount} ${quote.coin_key} from ${quote.pool_key} (${quote.strategy})`,
  });

  for (const [index, step] of quote.steps.entries()) {
    steps.push({
      id: `swap-${index + 1}`,
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
      id: "repay",
      status: quote.repay_feasible ? "ok" : "failed",
      label: "Repay check",
      detail: `${repayDetail} — ${surplusLabel}`,
    });
  } else {
    steps.push({
      id: "repay",
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
      const message = executeCall.result.error.message ?? "Transaction failed";
      if (isFlashLoanParamValidationError(message)) {
        steps.push({
          id: "execute",
          status: "skipped",
          label: "Execute bundle",
          detail: message,
        });
      } else {
        steps.push({
          id: "execute",
          status: "failed",
          label: "Execute bundle",
          detail: message,
        });
      }
    } else {
      const outcome = executeCall.result as {
        status?: string;
        agent_transaction_id?: string;
        pending?: { id?: string; chain_id?: AgentChainId; action?: string };
        result?: { chain_id?: AgentChainId; digest?: string };
      };

      const agentTransactionId =
        outcome.agent_transaction_id ?? outcome.pending?.id;
      const chainId =
        outcome.result?.chain_id ??
        outcome.pending?.chain_id ??
        ("sui" as AgentChainId);
      const flashLoan = (
        executeCall.result as {
          result?: {
            deepbook?: {
              flash_loan?: { borrow_amount?: number; coin_key?: string };
            };
          };
        }
      )?.result?.deepbook?.flash_loan;
      const meta = {
        ...(agentTransactionId ? { agentTransactionId } : {}),
        chainId,
      };

      if (outcome.status === "approval_required") {
        steps.push({
          id: "execute",
          status: "warning",
          label: "Execute bundle",
          detail: "Waiting for your approval in the dialog",
          ...meta,
        });
      } else if (outcome.status === "executed" && outcome.result?.digest) {
        const digest = outcome.result.digest;
        steps.push({
          id: "execute",
          status: "ok",
          label: "Execute bundle",
          detail:
            flashLoan?.borrow_amount != null && flashLoan.coin_key
              ? `Borrow ${flashLoan.borrow_amount} ${flashLoan.coin_key} · ${digest.slice(0, 10)}…`
              : `Broadcast · ${digest.slice(0, 10)}…`,
          digest,
          ...meta,
        });
      }
    }
  } else if (!quote.repay_feasible) {
    const meta = quote.agent_transaction_id
      ? {
          agentTransactionId: quote.agent_transaction_id,
          chainId: "sui" as AgentChainId,
        }
      : {};
    steps.push({
      id: "execute",
      status: "skipped",
      label: "Execute bundle",
      detail:
        "Blocked — swap outputs would not cover the borrow for atomic repay",
      ...meta,
    });
  }

  return steps;
}

function buildSwapExecutionSteps(
  toolCalls: ChatToolCall[],
): ExecutionStep[] | undefined {
  const quoteCall = toolCalls.find(
    (call) =>
      call.name === "query_chain" &&
      !isToolError(call.result) &&
      typeof call.result === "object" &&
      call.result !== null &&
      "input_coin" in call.result &&
      "output_amount_display" in call.result,
  );

  const executeCall = toolCalls.find(
    (call) =>
      call.name === "execute_transaction" || call.name === "call_app_action",
  );
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
        id: "swap-quote",
        status: "ok",
        label: "Swap quote",
        detail: `${quote.input_amount_display} ${quote.input_coin} → ~${quote.output_amount_display} ${quote.output_coin}${quote.pool_key ? ` (${quote.pool_key})` : ""}`,
      });
    }
  }

  if (executeCall) {
    const isAppAction = executeCall.name === "call_app_action";
    const executeLabel = isAppAction ? "Execute swap" : "Execute swap";

    if (isToolError(executeCall.result)) {
      steps.push({
        id: "execute",
        status: "failed",
        label: executeLabel,
        detail: executeCall.result.error.message,
      });
    } else if (isAppAction) {
      const outcome = executeCall.result as {
        status?: string;
        agent_transaction_id?: string;
        digest?: string;
        pending?: { id?: string; chain_id?: AgentChainId };
        result?: { chain_id?: AgentChainId };
        error?: { message?: string };
      };

      if (outcome.status === "error" && outcome.error?.message) {
        steps.push({
          id: "execute",
          status: "failed",
          label: executeLabel,
          detail: outcome.error.message,
        });
      } else {
        const agentTransactionId =
          outcome.agent_transaction_id ?? outcome.pending?.id;
        const chainId = outcome.result?.chain_id ?? outcome.pending?.chain_id;
        const meta = {
          ...(agentTransactionId ? { agentTransactionId } : {}),
          ...(chainId ? { chainId } : {}),
        };

        if (outcome.status === "preview_delegated") {
          const actionName = (executeCall.result as { action?: string })
            ?.action;
          steps.push({
            id: "execute",
            status: "warning",
            label: actionName ? `Execute ${actionName}` : executeLabel,
            detail: "Started in app preview — confirm there",
          });
        } else if (outcome.status === "approval_required") {
          steps.push({
            id: "execute",
            status: "warning",
            label: executeLabel,
            detail: "Waiting for your approval in the app",
            ...meta,
          });
        } else if (outcome.status === "executed" && outcome.digest) {
          steps.push({
            id: "execute",
            status: "ok",
            label: executeLabel,
            detail: `Broadcast · ${outcome.digest.slice(0, 10)}…`,
            digest: outcome.digest,
            ...meta,
          });
        }
      }
    } else {
      const outcome = executeCall.result as {
        status?: string;
        agent_transaction_id?: string;
        pending?: { id?: string; chain_id?: AgentChainId };
        result?: {
          chain_id?: AgentChainId;
          digest?: string;
          deepbook?: {
            swap?: {
              in_amount_display?: number;
              input_coin?: string;
              out_amount_display?: number;
              output_coin?: string;
            };
          };
        };
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
          id: "execute",
          status: "warning",
          label: "Execute swap",
          detail: "Waiting for your approval in the dialog",
          ...meta,
        });
      } else if (outcome.status === "executed" && outcome.result?.digest) {
        const swap = outcome.result.deepbook?.swap;
        steps.push({
          id: "execute",
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
    if (!hasFlashLoanExecutionAttemptInTurn(toolCalls)) {
      return undefined;
    }
    return buildFlashLoanExecutionSteps(toolCalls, flashQuoteIndex, quote);
  }

  return buildSwapExecutionSteps(toolCalls);
}

function isFlashLoanRelatedError(message: string): boolean {
  return isFlashLoanParamValidationError(message);
}

function buildFailedToolExecutionSteps(
  toolCalls: ChatToolCall[],
): ExecutionStep[] | undefined {
  const steps: ExecutionStep[] = [];

  for (const call of toolCalls) {
    if (call.name === "query_chain" && isToolError(call.result)) {
      const message = sanitizeToolErrorMessage(call.result.error.message);
      const stepMatch = message.match(/Step (\d+)/i);
      const isFlashLoanQuery =
        call.query === "flash_loan_quote" || isFlashLoanRelatedError(message);

      if (isFlashLoanQuery) {
        if (stepMatch) {
          steps.push({
            id: `swap-${stepMatch[1]}`,
            status: "failed",
            label: `Swap ${stepMatch[1]}`,
            detail: message,
          });
        }
        steps.push({
          id: "quote",
          status: "failed",
          label: "Quote flash loan",
          detail: message,
        });
      } else {
        steps.push({
          id: `query-failed-${steps.length}`,
          status: "failed",
          label: "Query failed",
          detail: message,
        });
      }
      continue;
    }

    if (call.name === "execute_transaction" && isToolError(call.result)) {
      const message = sanitizeToolErrorMessage(call.result.error.message);
      if (isFlashLoanParamValidationError(message)) {
        steps.push({
          id: "quote",
          status: "failed",
          label: "Quote flash loan",
          detail: message,
        });
        steps.push({
          id: "execute",
          status: "skipped",
          label: "Execute bundle",
          detail: "Blocked — fix the flash loan route before executing",
        });
      } else {
        steps.push({
          id: "execute",
          status: "failed",
          label: "Execute bundle",
          detail: message,
        });
      }
    }
  }

  return steps.length > 0 ? steps : undefined;
}

/** Merge streamed steps with tool-derived steps; later updates win per id. */
export function mergeExecutionSteps(
  base: ExecutionStep[],
  incoming: ExecutionStep[],
): ExecutionStep[] {
  let merged = [...base];
  for (const step of incoming) {
    merged = upsertExecutionStep(merged, step);
  }
  return sortExecutionSteps(merged);
}

/** Build execution timeline from tool calls and optional streamed steps. */
export function resolveExecutionSteps(
  toolCalls: ChatToolCall[],
  streamedSteps: ExecutionStep[] = [],
): ExecutionStep[] | undefined {
  const fromTools = mapToolCallsToExecutionSteps(toolCalls);
  const fromFailures = buildFailedToolExecutionSteps(toolCalls);
  const combined = filterExecutionStepsForDisplay(
    mergeExecutionSteps(
      streamedSteps,
      mergeExecutionSteps(fromTools ?? [], fromFailures ?? []),
    ),
    toolCalls,
  );
  return combined.length > 0 ? combined : undefined;
}

/** Whether failed query_chain pills should be hidden (execution timeline covers them). */
export function shouldSuppressQueryFailureReceipts(
  toolCalls: ChatToolCall[],
): boolean {
  if (mapToolCallsToExecutionSteps(toolCalls) !== undefined) {
    return true;
  }
  if (buildFailedToolExecutionSteps(toolCalls) !== undefined) {
    return true;
  }
  const flashQuoteIndex = findLatestFlashLoanQuoteIndex(toolCalls);
  if (flashQuoteIndex < 0) {
    return false;
  }
  const quote = toolCalls[flashQuoteIndex].result as FlashLoanQuoteResult;
  return !quote.repay_feasible;
}
