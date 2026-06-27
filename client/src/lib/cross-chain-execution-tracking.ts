import type { AgentTransactionDetail, AgentTransactionListItem } from "@/lib/agent-transactions-api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { PendingTransaction } from "@/lib/chat-api";
import { isAlternateCrossChainRoute } from "@/lib/cross-chain-fallback";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import { mergeExecutionSteps, sortExecutionSteps, upsertExecutionStep } from "@/lib/chat-execution-steps";
import {
  applyLifiLiveUpdateToMessages,
  executionStepsForPendingApproval as lifiExecutionStepsForPendingApproval,
  executionStepsFromAgentTransaction as lifiExecutionStepsFromAgentTransaction,
  isInFlightLifiTransaction,
  normalizeLifiExecutionSteps,
} from "@/lib/lifi-execution-tracking";
import {
  collectTrackedInFlightTransactionIds,
  executionStepsForPendingApproval as stellarExecutionStepsForPendingApproval,
  executionStepsFromAgentTransaction as stellarExecutionStepsFromAgentTransaction,
  isInFlightStellarTransaction,
  isStellarPending,
} from "@/lib/stellar-execution-tracking";
import {
  lifiBridgeStepLabel,
  lifiCountdownKind,
  isSameChainLifiRoute,
  type LifiCountdownKind,
} from "@/lib/lifi-countdown";

export {
  OPTIMISTIC_APPROVAL_MESSAGE_PREFIX,
  optimisticApprovalMessageId,
  applyLifiLiveUpdateToMessages,
  applyLifiTransactionStepsToMessages,
  applyOptimisticLifiApprovalToMessages,
  foldApproveOutcomeIntoLifiMessage,
  mergeTransactionStepsIntoMessages,
  messageTracksLifiTransaction,
  findAgentMessageIndexForLifiTransaction,
  stripStaleApprovalExecuteStep,
  reconcileTerminalLifiSteps,
} from "@/lib/lifi-execution-tracking";

type SquidTrackingMeta = {
  route_id?: string;
  tx_hashes?: string[];
  from_chain_id?: AgentChainId;
  to_chain_id?: AgentChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  estimated_duration_seconds?: number | null;
  bridge_started_at?: string | null;
  tracking_status?: string | null;
  substatus_message?: string | null;
  receiving_tx_hash?: string | null;
  bridge_type?: "chainflip" | "chainflipmultihop" | null;
  chainflip_status_tracking_id?: string | null;
  chainflip_deposit?: {
    deposit_address: string;
    amount: string;
    chainflip_status_tracking_id: string;
    bridge_type: "chainflip" | "chainflipmultihop";
  } | null;
};

function isChainflipDepositRoute(
  result: Record<string, unknown> | null | undefined,
  tracking: SquidTrackingMeta | null,
): boolean {
  if (tracking?.chainflip_deposit || tracking?.chainflip_status_tracking_id) {
    return true;
  }
  const squidRoute = result?.squid_route;
  if (!squidRoute || typeof squidRoute !== "object") {
    return false;
  }
  const txRequest = (squidRoute as { transactionRequest?: { type?: string } }).transactionRequest;
  return txRequest?.type === "CHAINFLIP_DEPOSIT_ADDRESS";
}

function isChainflipDepositPending(pending: PendingTransaction): boolean {
  const squidRoute = pending.params?.squid_route;
  if (!squidRoute || typeof squidRoute !== "object") {
    return false;
  }
  const txRequest = (squidRoute as { transactionRequest?: { type?: string } }).transactionRequest;
  return txRequest?.type === "CHAINFLIP_DEPOSIT_ADDRESS";
}

function chainflipDepositSteps(meta: {
  agentTransactionId?: string;
  chainId: AgentChainId;
  evmChainId?: number;
  digest?: string;
  depositPhase: "address" | "send" | "done";
}): ExecutionStep[] {
  const shared = {
    agentTransactionId: meta.agentTransactionId,
    chainId: meta.chainId,
    ...(meta.evmChainId !== undefined ? { evmChainId: meta.evmChainId } : {}),
    ...(meta.digest ? { digest: meta.digest } : {}),
  };

  const addressStatus =
    meta.depositPhase === "address"
      ? "running"
      : meta.depositPhase === "send" || meta.depositPhase === "done"
        ? "ok"
        : "pending";
  const sendStatus =
    meta.depositPhase === "send"
      ? "running"
      : meta.depositPhase === "done"
        ? "ok"
        : meta.depositPhase === "address"
          ? "pending"
          : "pending";

  return [
    {
      id: "squid-deposit-address",
      status: addressStatus,
      label: "Preparing deposit…",
      detail: "Fetching Chainflip deposit address",
      ...shared,
    },
    {
      id: "squid-deposit-send",
      status: sendStatus,
      label: "Sending to bridge…",
      detail:
        meta.depositPhase === "done" && meta.digest
          ? `Deposit tx · ${meta.digest.slice(0, 10)}…`
          : "Transferring assets to bridge deposit address",
      ...shared,
    },
  ];
}

function crossChainCountdownFields(input: {
  fromChainId?: AgentChainId;
  toChainId?: AgentChainId;
  fromEvmChainId?: number;
  toEvmChainId?: number;
  estimatedDurationSeconds?: number | null;
  bridgeStartedAt?: string | null;
}): Pick<ExecutionStep, "estimatedDurationSeconds" | "bridgeStartedAt" | "countdownKind"> {
  const kind = lifiCountdownKind({
    fromChainId: input.fromChainId,
    toChainId: input.toChainId,
    fromEvmChainId: input.fromEvmChainId,
    toEvmChainId: input.toEvmChainId,
  });
  return {
    ...(input.estimatedDurationSeconds != null
      ? { estimatedDurationSeconds: input.estimatedDurationSeconds }
      : {}),
    ...(input.bridgeStartedAt ? { bridgeStartedAt: input.bridgeStartedAt } : {}),
    countdownKind: kind,
  };
}

function crossChainBridgeLabel(input: {
  kind: LifiCountdownKind;
  phase: "running" | "done" | "failed";
  estimatedDurationSeconds?: number | null;
  bridgeStartedAt?: string | null;
}): string {
  return lifiBridgeStepLabel(input);
}

function readSquidTracking(
  result: Record<string, unknown> | null | undefined,
): SquidTrackingMeta | null {
  const squid = result?.squid;
  if (!squid || typeof squid !== "object") {
    return null;
  }
  return squid as SquidTrackingMeta;
}

function isSquidTerminalSuccess(status: string | null | undefined): boolean {
  return status === "SUCCESS" || status === "PARTIAL_SUCCESS" || status === "DONE";
}

function isSquidTerminalFailure(status: string | null | undefined): boolean {
  return status === "FAILED" || status === "NOT_FOUND" || status === "REFUNDED";
}

function isSameChainSquidRoute(tracking: SquidTrackingMeta): boolean {
  return isSameChainLifiRoute({
    fromChainId: tracking.from_chain_id,
    toChainId: tracking.to_chain_id,
    fromEvmChainId: tracking.from_evm_chain_id,
    toEvmChainId: tracking.to_evm_chain_id,
  });
}

function isSameChainSquidPending(pending: PendingTransaction): boolean {
  const params = pending.params;
  return isSameChainLifiRoute({
    fromChainId:
      (params?.from_chain_id as AgentChainId | undefined) ??
      (pending.chain_id as AgentChainId | undefined),
    toChainId: params?.to_chain_id as AgentChainId | undefined,
    fromEvmChainId:
      typeof params?.from_evm_chain_id === "number" ? params.from_evm_chain_id : undefined,
    toEvmChainId:
      typeof params?.to_evm_chain_id === "number" ? params.to_evm_chain_id : undefined,
  });
}

function executionStepsFromSquidTransaction(
  tx: AgentTransactionDetail | AgentTransactionListItem,
  tracking: SquidTrackingMeta,
  result?: Record<string, unknown> | null,
): ExecutionStep[] {
  const chainId = (tx.chain_id ?? tracking.from_chain_id ?? "ethereum") as AgentChainId;
  const toChainId = (tracking.to_chain_id ?? chainId) as AgentChainId;
  const evmChainId = tracking.from_evm_chain_id;
  const digest = tx.digest ?? tracking.tx_hashes?.[0];
  const sameChain = isSameChainSquidRoute(tracking);
  const meta = {
    agentTransactionId: tx.id,
    chainId,
    ...(evmChainId !== undefined ? { evmChainId } : {}),
    ...(digest ? { digest } : {}),
  };
  const countdownMeta = crossChainCountdownFields({
    fromChainId: chainId,
    toChainId,
    fromEvmChainId: evmChainId,
    toEvmChainId: tracking.to_evm_chain_id,
    estimatedDurationSeconds: tracking.estimated_duration_seconds,
    bridgeStartedAt: tracking.bridge_started_at,
  });
  const countdownKind = countdownMeta.countdownKind ?? (sameChain ? "swap" : "bridge");
  const isChainflip = isChainflipDepositRoute(result, tracking);

  const steps: ExecutionStep[] = [
    {
      id: "lifi-quote",
      status: "ok",
      label: sameChain ? "Route quoted" : "Alternate route quoted",
      detail: sameChain ? "Cross-chain route ready" : "Route ready via alternate provider",
      ...meta,
    },
  ];

  if (isChainflip) {
    const depositPhase =
      digest && (tx.status === "submitted" || tx.status === "success")
        ? "done"
        : tx.status === "submitted"
          ? "send"
          : "address";
    steps.push(
      ...chainflipDepositSteps({
        agentTransactionId: tx.id,
        chainId,
        evmChainId,
        digest,
        depositPhase,
      }),
    );
  }

  steps.push({
    id: "lifi-submit",
    status: digest ? "ok" : tx.status === "submitted" ? "running" : "pending",
    label: isChainflip ? "Deposit submitted" : "Submitting",
    detail: digest
      ? isChainflip
        ? `Deposit tx · ${digest.slice(0, 10)}…`
        : `Source tx · ${digest.slice(0, 10)}…`
      : isChainflip
        ? "Broadcasting deposit transfer"
        : "Broadcasting source transaction",
    ...meta,
  });

  const trackingStatus = tracking.tracking_status;
  const swapComplete =
    tx.status === "success" ||
    tx.effects_status === "success" ||
    isSquidTerminalSuccess(trackingStatus) ||
    (sameChain && Boolean(digest) && tx.status !== "failure");

  if (swapComplete) {
    if (sameChain) {
      steps.push(
        {
          id: "lifi-bridge",
          status: "ok",
          label: "Swapped",
          detail: digest ? `Tx · ${digest.slice(0, 10)}…` : "Swap confirmed",
          ...meta,
          countdownKind: "swap" as const,
        },
        {
          id: "lifi-complete",
          status: "ok",
          label: "Complete",
          detail: digest ? `Tx · ${digest.slice(0, 10)}…` : "Swap complete",
          ...(digest ? { digest, chainId } : {}),
          agentTransactionId: tx.id,
        },
      );
      return steps;
    }

    const destDigest =
      tracking.receiving_tx_hash ?? tracking.tx_hashes?.at(-1) ?? digest;
    steps.push(
      {
        id: "lifi-bridge",
        status: "ok",
        label: crossChainBridgeLabel({
          kind: countdownKind,
          phase: "done",
          estimatedDurationSeconds: tracking.estimated_duration_seconds,
          bridgeStartedAt: tracking.bridge_started_at,
        }),
        detail: tracking.substatus_message ?? "Bridge confirmed",
        ...meta,
        ...countdownMeta,
      },
      {
        id: "lifi-complete",
        status: "ok",
        label: "Complete",
        detail: destDigest ? `Destination tx · ${destDigest.slice(0, 10)}…` : "Bridge complete",
        ...(destDigest ? { digest: destDigest, chainId: tracking.to_chain_id ?? chainId } : {}),
        agentTransactionId: tx.id,
      },
    );
    return steps;
  }

  if (tx.status === "failure" || isSquidTerminalFailure(trackingStatus)) {
    steps.push(
      {
        id: "lifi-bridge",
        status: "failed",
        label: crossChainBridgeLabel({
          kind: countdownKind,
          phase: "failed",
          estimatedDurationSeconds: tracking.estimated_duration_seconds,
          bridgeStartedAt: tracking.bridge_started_at,
        }),
        detail: tracking.substatus_message ?? "Bridge failed",
        ...meta,
        ...countdownMeta,
      },
      {
        id: "lifi-complete",
        status: "failed",
        label: "Failed",
        detail: tx.status === "failure" ? "Cross-chain transfer did not complete" : "Bridge failed",
        agentTransactionId: tx.id,
        chainId,
      },
    );
    return steps;
  }

  steps.push({
    id: "lifi-bridge",
    status: "running",
    label: crossChainBridgeLabel({
      kind: countdownKind,
      phase: "running",
      estimatedDurationSeconds: tracking.estimated_duration_seconds,
      bridgeStartedAt: tracking.bridge_started_at,
    }),
    detail: tracking.substatus_message ?? "Waiting for destination confirmation",
    ...meta,
    ...countdownMeta,
  });

  return steps;
}

/** Live execution steps when user approves a cross-chain pending tx. */
export function executionStepsForPendingApproval(
  pending: PendingTransaction,
): ExecutionStep[] {
  if (isStellarPending(pending)) {
    return stellarExecutionStepsForPendingApproval(pending);
  }
  if (isAlternateCrossChainRoute(pending)) {
    const sameChain = isSameChainSquidPending(pending);
    const base = lifiExecutionStepsForPendingApproval(pending);
    const mapped = base.map((step) =>
      step.id === "lifi-quote"
        ? {
            ...step,
            label: sameChain ? "Route quoted" : "Alternate route quoted",
            detail: sameChain
              ? (step.detail ?? "Cross-chain route ready")
              : (step.detail ?? "Route ready"),
          }
        : step,
    );
    if (isChainflipDepositPending(pending)) {
      const chainId = (pending.chain_id ?? pending.params?.from_chain_id ?? "solana") as AgentChainId;
      const evmChainId =
        typeof pending.params?.from_evm_chain_id === "number"
          ? pending.params.from_evm_chain_id
          : undefined;
      return [
        ...mapped.filter((step) => step.id === "lifi-quote"),
        ...chainflipDepositSteps({
          chainId,
          evmChainId,
          depositPhase: "address",
        }),
        ...mapped.filter((step) => step.id !== "lifi-quote"),
      ];
    }
    return mapped;
  }
  return lifiExecutionStepsForPendingApproval(pending);
}

export function executionStepsFromAgentTransaction(
  tx: AgentTransactionDetail | AgentTransactionListItem,
  result: Record<string, unknown> | null | undefined,
): ExecutionStep[] | undefined {
  const stellar = stellarExecutionStepsFromAgentTransaction(tx, result);
  if (stellar) {
    return stellar;
  }
  const squid = readSquidTracking(result);
  if (squid) {
    return executionStepsFromSquidTransaction(tx, squid, result);
  }
  return lifiExecutionStepsFromAgentTransaction(tx, result);
}

function isLikelySquidListItem(tx: AgentTransactionListItem): boolean {
  return (
    tx.title.startsWith("Bridge ") &&
    (tx.category === "swap" || tx.category === "other")
  );
}

export function isInFlightSquidTransaction(tx: AgentTransactionListItem): boolean {
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
    isLikelySquidListItem(tx) &&
    tx.effects_status !== "success" &&
    tx.effects_status !== "failure"
  );
}

export function isInFlightCrossChainTransaction(tx: AgentTransactionListItem): boolean {
  return (
    isInFlightLifiTransaction(tx) ||
    isInFlightSquidTransaction(tx) ||
    isInFlightStellarTransaction(tx)
  );
}

export function collectTrackedCrossChainTransactionIds(
  messages: Array<{ executionSteps?: ExecutionStep[] }>,
): string[] {
  return collectTrackedInFlightTransactionIds(messages);
}

export function applyCrossChainLiveUpdateToMessages<
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
  return applyLifiLiveUpdateToMessages(messages, transactionId, steps, options);
}

export function applySquidLiveUpdateToMessages<
  T extends {
    id: string;
    role: string;
    text?: string;
    executionSteps?: ExecutionStep[];
    receipts?: Array<{ label: string; detail?: string; href?: string }>;
    statusCategory?: string;
    streaming?: boolean;
  },
>(
  messages: T[],
  transactionId: string,
  steps: ExecutionStep[],
  options?: { primaryMessageId?: string | null; detail?: AgentTransactionDetail | null },
): T[] {
  return applyCrossChainLiveUpdateToMessages(messages, transactionId, steps, options);
}

/** Immediate execution timeline when the user clicks Approve on a cross-chain route. */
export function applyOptimisticCrossChainApprovalToMessages<
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
  return applyCrossChainLiveUpdateToMessages(messages, pending.id, steps);
}

export function applyOptimisticSquidApprovalToMessages<
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
  return applyOptimisticCrossChainApprovalToMessages(messages, pending);
}

/** Mark the fallback-offer step skipped when the user declines alternate routing. */
export function markFallbackOfferDeclinedInMessages<
  T extends { executionSteps?: ExecutionStep[] },
>(messages: T[]): T[] {
  return messages.map((message) => {
    const steps = message.executionSteps;
    if (!steps?.some((step) => step.id === "fallback-offer")) {
      return message;
    }
    const next = sortExecutionSteps(
      upsertExecutionStep(steps, {
        id: "fallback-offer",
        status: "skipped",
        label: "Finding another route…",
        detail: "Alternate route declined",
      }),
    );
    return { ...message, executionSteps: next };
  });
}

/** Merge cross-chain agent transaction steps into hydrated session messages. */
export function mergeCrossChainTransactionStepsIntoMessages<
  T extends { id: string; executionSteps?: ExecutionStep[] },
>(
  messages: T[],
  transactions: AgentTransactionListItem[],
  details: Map<string, AgentTransactionDetail>,
): T[] {
  if (transactions.length === 0) {
    return messages;
  }

  const byMessageId = new Map<string, AgentTransactionListItem[]>();
  for (const tx of transactions) {
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
        executionSteps = normalizeLifiExecutionSteps(
          mergeExecutionSteps(executionSteps, steps),
        );
      }
    }

    return executionSteps.length > 0 ? { ...message, executionSteps } : message;
  });
}

export { isStellarPending, shouldInvalidateStellarWalletAssets } from "@/lib/stellar-execution-tracking";

export function isCrossChainPending(pending: PendingTransaction): boolean {
  return (
    isStellarPending(pending) ||
    pending.action === "cross_chain_swap" ||
    pending.defi_preview?.provider_id === "evm-lifi" ||
    pending.defi_preview?.provider_id === "evm-squid" ||
    isAlternateCrossChainRoute(pending)
  );
}
