import type { AgentTransactionDetail, AgentTransactionListItem } from "@/lib/agent-transactions-api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { PendingTransaction } from "@/lib/chat-api";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import {
  mergeExecutionSteps,
  sortExecutionSteps,
  type StreamExecutionStepPayload,
} from "@/lib/chat-execution-steps";
import {
  applyLifiTransactionStepsToMessages,
  collectTrackedLifiTransactionIds,
} from "@/lib/lifi-execution-tracking";

export const STELLAR_ROUTING_OFFER_LABEL = "Checking Stellar option…";
export const SOROSWAP_QUOTE_RUNNING_LABEL = "Getting Stellar quote…";
export const STELLAR_BUILD_RUNNING_LABEL = "Building transaction…";
export const STELLAR_SIGN_LABEL = "Awaiting signature…";
export const STELLAR_SUBMIT_LABEL = "Submitted";
export const STELLAR_CONFIRM_RUNNING_LABEL = "Confirming…";

const STELLAR_CHAIN_ID = "stellar" as const;

type SoroswapTrackingMeta = {
  tx_hash?: string;
  quote_id?: string;
  route_id?: string;
  tracking_status?: string | null;
  ledger?: number;
};

function readSoroswapTracking(
  result: Record<string, unknown> | null | undefined,
): SoroswapTrackingMeta | null {
  const soroswap = result?.soroswap;
  if (!soroswap || typeof soroswap !== "object") {
    return null;
  }
  return soroswap as SoroswapTrackingMeta;
}

function stellarMeta(input: {
  agentTransactionId?: string;
  digest?: string;
}): Pick<ExecutionStep, "agentTransactionId" | "chainId" | "digest"> {
  return {
    ...(input.agentTransactionId ? { agentTransactionId: input.agentTransactionId } : {}),
    chainId: STELLAR_CHAIN_ID,
    ...(input.digest ? { digest: input.digest } : {}),
  };
}

function isTerminalSoroswapSuccess(status: string | null | undefined): boolean {
  return status === "success";
}

function isTerminalSoroswapFailure(status: string | null | undefined): boolean {
  return status === "failed";
}

/** Client presentation for streamed Stellar execution steps. */
export function applyStellarStreamStepPresentation(
  step: StreamExecutionStepPayload,
): Pick<ExecutionStep, "label" | "status"> | null {
  if (step.id === "stellar_routing_fallback_offered") {
    return {
      label: STELLAR_ROUTING_OFFER_LABEL,
      status: step.status === "running" ? "pending" : step.status,
    };
  }
  if (step.id === "soroswap_quote" && step.status === "running") {
    return { label: SOROSWAP_QUOTE_RUNNING_LABEL, status: step.status };
  }
  if (step.id === "stellar_build" && step.status === "running") {
    return { label: STELLAR_BUILD_RUNNING_LABEL, status: step.status };
  }
  if (step.id === "stellar_sign") {
    return {
      label: STELLAR_SIGN_LABEL,
      status: step.status === "running" ? "warning" : step.status,
    };
  }
  if (step.id === "stellar_submit") {
    return { label: STELLAR_SUBMIT_LABEL, status: step.status };
  }
  if (step.id === "stellar_confirm" && step.status === "running") {
    return { label: STELLAR_CONFIRM_RUNNING_LABEL, status: step.status };
  }
  return null;
}

export function isStellarPending(pending: PendingTransaction): boolean {
  return (
    pending.chain_id === STELLAR_CHAIN_ID ||
    pending.action === "stellar_swap" ||
    pending.defi_preview?.provider_id === "stellar-soroswap" ||
    pending.params?.provider_id === "stellar-soroswap" ||
    (typeof pending.params?.route_id === "string" &&
      pending.params.route_id.startsWith("soroswap:")) ||
    (typeof pending.params?.quote_id === "string" &&
      pending.params.quote_id.startsWith("soroswap:"))
  );
}

function routeDetail(pending: PendingTransaction): string | undefined {
  const preview = pending.defi_preview;
  if (preview?.route_summary) {
    return preview.route_summary;
  }
  if (preview?.pay?.symbol && preview?.receive?.symbol) {
    return `${preview.pay.symbol} → ${preview.receive.symbol}`;
  }
  return pending.amount_display || pending.summary;
}

/** Optimistic timeline when the user approves a Stellar Soroswap swap. */
export function executionStepsForPendingApproval(
  pending: PendingTransaction,
): ExecutionStep[] {
  const meta = stellarMeta({ agentTransactionId: pending.id });
  const detail = routeDetail(pending);

  return [
    {
      id: "soroswap-quote",
      status: "ok",
      label: "Stellar quote ready",
      ...(detail ? { detail } : {}),
      ...meta,
    },
    {
      id: "stellar-build",
      status: "running",
      label: STELLAR_BUILD_RUNNING_LABEL,
      ...meta,
    },
    {
      id: "stellar-sign",
      status: "warning",
      label: STELLAR_SIGN_LABEL,
      detail: "Waiting for your approval in the dialog",
      ...meta,
    },
  ];
}

function executionStepsFromSoroswapTransaction(
  tx: AgentTransactionDetail | AgentTransactionListItem,
  tracking: SoroswapTrackingMeta,
): ExecutionStep[] {
  const digest = tx.digest ?? tracking.tx_hash;
  const meta = stellarMeta({ agentTransactionId: tx.id, digest });
  const trackingStatus = tracking.tracking_status ?? null;

  const steps: ExecutionStep[] = [
    {
      id: "soroswap-quote",
      status: "ok",
      label: "Stellar quote ready",
      ...meta,
    },
    {
      id: "stellar-build",
      status: "ok",
      label: "Transaction built",
      ...meta,
    },
    {
      id: "stellar-sign",
      status: "ok",
      label: STELLAR_SIGN_LABEL,
      ...meta,
    },
    {
      id: "stellar-submit",
      status: digest ? "ok" : tx.status === "submitted" ? "running" : "pending",
      label: STELLAR_SUBMIT_LABEL,
      detail: digest ? `Tx · ${digest.slice(0, 10)}…` : "Broadcasting Stellar transaction",
      ...meta,
    },
  ];

  const swapComplete =
    tx.status === "success" ||
    tx.effects_status === "success" ||
    isTerminalSoroswapSuccess(trackingStatus);

  if (swapComplete) {
    steps.push({
      id: "stellar-confirm",
      status: "ok",
      label: "Complete",
      detail: digest ? `Confirmed · ${digest.slice(0, 10)}…` : "Swap complete",
      ...meta,
    });
    return steps;
  }

  if (tx.status === "failure" || isTerminalSoroswapFailure(trackingStatus)) {
    steps.push({
      id: "stellar-confirm",
      status: "failed",
      label: "Failed",
      detail: "Stellar swap did not confirm on-chain",
      ...meta,
    });
    return steps;
  }

  steps.push({
    id: "stellar-confirm",
    status: "running",
    label: STELLAR_CONFIRM_RUNNING_LABEL,
    detail: "Waiting for Stellar ledger confirmation",
    ...meta,
  });

  return steps;
}

export function executionStepsFromAgentTransaction(
  tx: AgentTransactionDetail | AgentTransactionListItem,
  result: Record<string, unknown> | null | undefined,
): ExecutionStep[] | undefined {
  const soroswap = readSoroswapTracking(result);
  if (!soroswap) {
    return undefined;
  }
  return executionStepsFromSoroswapTransaction(tx, soroswap);
}

function isLikelyStellarListItem(tx: AgentTransactionListItem): boolean {
  return (
    tx.chain_id === STELLAR_CHAIN_ID &&
    (tx.title.startsWith("Swap on Stellar") ||
      tx.title.startsWith("Swap ") ||
      tx.category === "swap")
  );
}

export function isInFlightStellarTransaction(tx: AgentTransactionListItem): boolean {
  if (tx.chain_id !== STELLAR_CHAIN_ID) {
    return false;
  }
  if (tx.status === "success" && tx.effects_status === "pending") {
    return true;
  }
  if (tx.status === "success" && tx.effects_status === "success") {
    return false;
  }
  if (tx.status !== "submitted") {
    return false;
  }
  if (tx.effects_status === "pending") {
    return true;
  }
  return (
    isLikelyStellarListItem(tx) &&
    tx.effects_status !== "success" &&
    tx.effects_status !== "failure"
  );
}

export function collectTrackedStellarTransactionIds(
  messages: Array<{ executionSteps?: ExecutionStep[] }>,
): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const step of message.executionSteps ?? []) {
      if (!step.agentTransactionId) {
        continue;
      }
      if (
        (step.id === "stellar-submit" || step.id === "stellar-confirm") &&
        (step.status === "running" || step.status === "pending")
      ) {
        ids.add(step.agentTransactionId);
      }
    }
  }
  return [...ids];
}

export function normalizeStellarExecutionSteps(steps: ExecutionStep[]): ExecutionStep[] {
  return sortExecutionSteps(steps);
}

export function applyStellarLiveUpdateToMessages<
  T extends {
    id: string;
    role: string;
    text?: string;
    executionSteps?: ExecutionStep[];
    receipts?: Array<{ label: string; detail?: string; href?: string; digest?: string; chainId?: AgentChainId; evmChainId?: number }>;
    statusCategory?: string;
    streaming?: boolean;
  },
>(
  messages: T[],
  transactionId: string,
  steps: ExecutionStep[],
  options?: { primaryMessageId?: string | null; detail?: AgentTransactionDetail | null },
): T[] {
  return applyLifiTransactionStepsToMessages(messages, transactionId, steps, options);
}

export function applyOptimisticStellarApprovalToMessages<
  T extends {
    id: string;
    role: string;
    text?: string;
    executionSteps?: ExecutionStep[];
    receipts?: Array<{ label: string; detail?: string; href?: string }>;
    statusCategory?: string;
    streaming?: boolean;
  },
>(messages: T[], pending: PendingTransaction): T[] {
  const steps = executionStepsForPendingApproval(pending);
  return applyStellarLiveUpdateToMessages(messages, pending.id, steps);
}

export function mergeStellarTransactionStepsIntoMessages<
  T extends { id: string; executionSteps?: ExecutionStep[] },
>(
  messages: T[],
  transactions: AgentTransactionListItem[],
  details: Map<string, AgentTransactionDetail>,
): T[] {
  const stellarTxs = transactions.filter(
    (tx) => tx.chain_id === STELLAR_CHAIN_ID || isLikelyStellarListItem(tx),
  );
  if (stellarTxs.length === 0) {
    return messages;
  }

  const byMessageId = new Map<string, AgentTransactionListItem[]>();
  for (const tx of stellarTxs) {
    if (!tx.message_id) continue;
    const bucket = byMessageId.get(tx.message_id) ?? [];
    bucket.push(tx);
    byMessageId.set(tx.message_id, bucket);
  }

  return messages.map((message) => {
    const related = byMessageId.get(message.id);
    if (!related?.length) {
      return message;
    }

    let executionSteps = message.executionSteps ?? [];
    for (const tx of related) {
      const detail = details.get(tx.id);
      const steps = executionStepsFromAgentTransaction(
        detail ?? tx,
        (detail?.result as Record<string, unknown> | null | undefined) ?? null,
      );
      if (steps) {
        executionSteps = normalizeStellarExecutionSteps(
          mergeExecutionSteps(executionSteps, steps),
        );
      }
    }

    return executionSteps.length > 0 ? { ...message, executionSteps } : message;
  });
}

export function shouldInvalidateStellarWalletAssets(steps: ExecutionStep[]): boolean {
  return steps.some(
    (step) => step.id === "stellar-confirm" && step.status === "ok" && step.chainId === STELLAR_CHAIN_ID,
  );
}

export function collectTrackedInFlightTransactionIds(
  messages: Array<{ executionSteps?: ExecutionStep[] }>,
): string[] {
  return [
    ...new Set([
      ...collectTrackedLifiTransactionIds(messages),
      ...collectTrackedStellarTransactionIds(messages),
    ]),
  ];
}
