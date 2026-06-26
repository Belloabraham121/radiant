import type { AgentTransactionDetail, AgentTransactionListItem } from "@/lib/agent-transactions-api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { PendingTransaction } from "@/lib/chat-api";
import { mergeReceiptsFromExecutionStep } from "@/lib/chat-messages";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import { mergeExecutionSteps, sortExecutionSteps } from "@/lib/chat-execution-steps";
import {
  explorerLinkLabel,
  explorerUrlForDigest,
} from "@/lib/explorer-tx-link";
import {
  lifiBridgeStepLabel,
  lifiCountdownKind,
  type LifiCountdownKind,
} from "@/lib/lifi-countdown";

export const OPTIMISTIC_APPROVAL_MESSAGE_PREFIX = "optimistic-approval-";

export function optimisticApprovalMessageId(transactionId: string): string {
  return `${OPTIMISTIC_APPROVAL_MESSAGE_PREFIX}${transactionId}`;
}

/** Live execution steps shown after Approve while the server broadcasts. */
export function executionStepsForPendingApproval(
  pending: PendingTransaction,
): ExecutionStep[] {
  const chainId = (pending.chain_id ?? "sui") as AgentChainId;
  const fromChainId = (
    typeof pending.params.from_chain_id === "string"
      ? pending.params.from_chain_id
      : pending.chain_id
  ) as AgentChainId;
  const toChainId = (
    typeof pending.params.to_chain_id === "string"
      ? pending.params.to_chain_id
      : pending.chain_id
  ) as AgentChainId;
  const fromEvmChainId =
    typeof pending.params.from_evm_chain_id === "number"
      ? pending.params.from_evm_chain_id
      : undefined;

  const meta = {
    agentTransactionId: pending.id,
    chainId: fromChainId,
    ...(fromEvmChainId !== undefined ? { evmChainId: fromEvmChainId } : {}),
  };

  const isLifi =
    pending.action === "cross_chain_swap" ||
    pending.defi_preview?.provider_id === "evm-lifi";

  if (isLifi) {
    const isSameChain =
      fromChainId === toChainId &&
      (fromEvmChainId === undefined ||
        fromEvmChainId ===
          (typeof pending.params.to_evm_chain_id === "number"
            ? pending.params.to_evm_chain_id
            : fromEvmChainId));
    const bridgeTool =
      pending.defi_preview?.bridges?.[0] ??
      (Array.isArray(pending.params.bridges)
        ? (pending.params.bridges as string[])[0]
        : null);
    const routeDetail =
      pending.defi_preview?.route_summary ??
      (pending.defi_preview?.pay?.symbol && pending.defi_preview?.receive?.symbol
        ? `${pending.defi_preview.pay.symbol} → ${pending.defi_preview.receive.symbol}`
        : isSameChain
          ? "Same-chain swap"
          : "Cross-chain route");

    return [
      {
        id: "lifi-quote",
        status: "ok",
        label: "Route quoted",
        detail: bridgeTool ? `${routeDetail} via ${bridgeTool}` : routeDetail,
        ...meta,
      },
      {
        id: "lifi-submit",
        status: "running",
        label: "Submitting",
        detail: "Signing and broadcasting transaction",
        ...meta,
      },
    ];
  }

  const label =
    pending.action === "deepbook_swap" || pending.action === "swap"
      ? "Swapping"
      : pending.defi_preview?.kind === "bridge"
        ? "Bridging"
        : "Submitting";

  return [
    {
      id: "execute",
      status: "running",
      label,
      detail: "Signing and broadcasting transaction",
      agentTransactionId: pending.id,
      chainId,
    },
  ];
}

type LifiTrackingMeta = {
  route_id?: string;
  tx_hashes?: string[];
  from_chain_id?: AgentChainId;
  to_chain_id?: AgentChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  bridge_tool?: string | null;
  estimated_duration_seconds?: number | null;
  bridge_started_at?: string | null;
  tracking_status?: string | null;
  substatus_message?: string | null;
  receiving_tx_hash?: string | null;
};

function lifiCountdownFields(input: {
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

function lifiBridgeLabel(input: {
  kind: LifiCountdownKind;
  phase: "running" | "done" | "failed";
  estimatedDurationSeconds?: number | null;
  bridgeStartedAt?: string | null;
}): string {
  return lifiBridgeStepLabel(input);
}

function readLifiTracking(result: Record<string, unknown> | null | undefined): LifiTrackingMeta | null {
  const lifi = result?.lifi;
  if (!lifi || typeof lifi !== "object") {
    return null;
  }
  return lifi as LifiTrackingMeta;
}

export function executionStepsFromAgentTransaction(
  tx: AgentTransactionDetail | AgentTransactionListItem,
  result: Record<string, unknown> | null | undefined,
): ExecutionStep[] | undefined {
  const tracking = readLifiTracking(result);
  if (!tracking) {
    return undefined;
  }

  const chainId = (tx.chain_id ?? tracking.from_chain_id ?? "ethereum") as AgentChainId;
  const toChainId = (tracking.to_chain_id ?? chainId) as AgentChainId;
  const evmChainId = tracking.from_evm_chain_id;
  const toEvmChainId = tracking.to_evm_chain_id;
  const digest = tx.digest ?? tracking.tx_hashes?.[0];
  const meta = {
    agentTransactionId: tx.id,
    chainId,
    ...(evmChainId !== undefined ? { evmChainId } : {}),
    ...(digest ? { digest } : {}),
  };
  const countdownMeta = lifiCountdownFields({
    fromChainId: chainId,
    toChainId,
    fromEvmChainId: evmChainId,
    toEvmChainId,
    estimatedDurationSeconds: tracking.estimated_duration_seconds,
    bridgeStartedAt: tracking.bridge_started_at,
  });
  const countdownKind = countdownMeta.countdownKind ?? "bridge";
  const steps: ExecutionStep[] = [
    {
      id: "lifi-quote",
      status: "ok",
      label: "Route quoted",
      detail: tracking.bridge_tool ? `Via ${tracking.bridge_tool}` : "Cross-chain route ready",
      ...meta,
    },
    {
      id: "lifi-submit",
      status: digest ? "ok" : tx.status === "submitted" ? "running" : "pending",
      label: "Submitting",
      detail: digest ? `Source tx · ${digest.slice(0, 10)}…` : "Broadcasting source transaction",
      ...meta,
    },
  ];

  const trackingStatus = tracking.tracking_status;
  if (tx.status === "success" || trackingStatus === "DONE") {
    const destDigest =
      tracking.receiving_tx_hash ?? tracking.tx_hashes?.at(-1) ?? digest;
    steps.push(
      {
        id: "lifi-bridge",
        status: "ok",
        label: lifiBridgeLabel({
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

  if (tx.status === "failure" || trackingStatus === "FAILED" || trackingStatus === "REFUNDED") {
    steps.push(
      {
        id: "lifi-bridge",
        status: "failed",
        label: lifiBridgeLabel({
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
    label: lifiBridgeLabel({
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

export function mergeTransactionStepsIntoMessages<
  T extends { id: string; executionSteps?: ExecutionStep[] },
>(messages: T[], transactions: AgentTransactionListItem[], details: Map<string, AgentTransactionDetail>): T[] {
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
        executionSteps = mergeExecutionSteps(executionSteps, steps);
      }
    }

    return executionSteps.length > 0 ? { ...message, executionSteps } : message;
  });
}

/** List items omit `action`; match Li-Fi titles from agent-transaction build-display. */
function isLikelyLifiListItem(tx: AgentTransactionListItem): boolean {
  return (
    tx.title.startsWith("Bridge ") ||
    tx.title === "Approve ERC-20 for Li-Fi bridge"
  );
}

export function isInFlightLifiTransaction(tx: AgentTransactionListItem): boolean {
  if (tx.status === "success" && tx.effects_status === "pending") {
    return true;
  }
  if (tx.status !== "submitted") {
    return false;
  }
  if (tx.effects_status === "pending") {
    return true;
  }
  // Approval claimed; source broadcast may still be in progress before Li-Fi meta is saved.
  return (
    isLikelyLifiListItem(tx) &&
    tx.effects_status !== "success" &&
    tx.effects_status !== "failure"
  );
}

/** Remove the pre-approval "waiting for dialog" step once execution starts. */
export function stripStaleApprovalExecuteStep(
  steps: ExecutionStep[],
): ExecutionStep[] {
  return steps.filter(
    (step) => !(step.id === "execute" && step.status === "warning"),
  );
}

export function messageTracksLifiTransaction(
  message: { executionSteps?: ExecutionStep[] },
  transactionId: string,
): boolean {
  return Boolean(
    message.executionSteps?.some(
      (step) => step.agentTransactionId === transactionId,
    ),
  );
}

/** Find the agent bubble that owns a Li-Fi transaction timeline. */
export function findAgentMessageIndexForLifiTransaction(
  messages: Array<{
    role: string;
    executionSteps?: ExecutionStep[];
    statusCategory?: string;
  }>,
  transactionId: string,
): number {
  const byTx = messages.findIndex(
    (message) =>
      message.role === "agent" &&
      messageTracksLifiTransaction(message, transactionId),
  );
  if (byTx >= 0) {
    return byTx;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "agent" && message.statusCategory === "defi") {
      return index;
    }
  }
  return -1;
}

/** Transaction ids that still show a running Li-Fi step in the UI. */
export function collectTrackedLifiTransactionIds(
  messages: Array<{ executionSteps?: ExecutionStep[] }>,
): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const step of message.executionSteps ?? []) {
      if (!step.agentTransactionId) {
        continue;
      }
      if (
        (step.id === "lifi-bridge" || step.id === "lifi-submit") &&
        (step.status === "running" || step.status === "pending")
      ) {
        ids.add(step.agentTransactionId);
      }
    }
  }
  return [...ids];
}

/** Stop the bridge countdown when terminal complete/failed steps are present. */
export function reconcileTerminalLifiSteps(
  steps: ExecutionStep[],
): ExecutionStep[] {
  const complete = steps.find((step) => step.id === "lifi-complete");
  if (!complete || (complete.status !== "ok" && complete.status !== "failed")) {
    return steps;
  }

  const phase = complete.status === "ok" ? "done" : "failed";
  return steps.map((step) => {
    if (step.id !== "lifi-bridge" || step.status !== "running") {
      return step;
    }
    const kind = step.countdownKind ?? "bridge";
    return {
      ...step,
      status: complete.status,
      label: lifiBridgeStepLabel({
        kind,
        phase,
        estimatedDurationSeconds: step.estimatedDurationSeconds,
        bridgeStartedAt: step.bridgeStartedAt,
      }),
      detail:
        complete.status === "ok"
          ? (step.detail ?? "Bridge confirmed")
          : (step.detail ?? "Bridge failed"),
    };
  });
}

function normalizeLifiExecutionSteps(steps: ExecutionStep[]): ExecutionStep[] {
  return sortExecutionSteps(
    reconcileTerminalLifiSteps(stripStaleApprovalExecuteStep(steps)),
  );
}

export function applyLifiTransactionStepsToMessages<
  T extends { id: string; role: string; executionSteps?: ExecutionStep[] },
>(
  messages: T[],
  transactionId: string,
  steps: ExecutionStep[],
  options?: { primaryMessageId?: string | null },
): T[] {
  if (steps.length === 0) {
    return messages;
  }

  return messages.map((message) => {
    const owns =
      (options?.primaryMessageId && message.id === options.primaryMessageId) ||
      (message.role === "agent" &&
        messageTracksLifiTransaction(message, transactionId));
    if (!owns) {
      return message;
    }
    return {
      ...message,
      executionSteps: normalizeLifiExecutionSteps(
        mergeExecutionSteps(message.executionSteps ?? [], steps),
      ),
    };
  });
}

const STALE_APPROVAL_TEXT_RE =
  /needs your approval|confirm in the dialog|Review the route/i;

const LIFI_SUBMITTING_REPLY = "Submitting transaction…";

function messageNeedsLiveLifiText(text: string | undefined): boolean {
  if (!text) {
    return true;
  }
  return STALE_APPROVAL_TEXT_RE.test(text) || text === LIFI_SUBMITTING_REPLY;
}

function readEvmChainIdFromDetail(
  detail: Pick<AgentTransactionDetail, "result" | "params"> | null | undefined,
): number | undefined {
  const result = detail?.result;
  if (result && typeof result.evm_chain_id === "number") {
    return result.evm_chain_id;
  }
  if (typeof detail?.params.from_evm_chain_id === "number") {
    return detail.params.from_evm_chain_id;
  }
  return undefined;
}

/** Client-side reply while approve HTTP is in flight or poll/SSE catches up. */
export function lifiLiveReplyFromSteps(
  steps: ExecutionStep[],
  detail?: Pick<AgentTransactionDetail, "chain_id" | "digest" | "result" | "params"> | null,
): string | null {
  const normalized = normalizeLifiExecutionSteps(steps);
  const complete = normalized.find((step) => step.id === "lifi-complete");
  const submit = normalized.find((step) => step.id === "lifi-submit");

  if (complete?.status === "ok") {
    const destDigest = complete.digest ?? submit?.digest ?? detail?.digest;
    const chainId = (complete.chainId ?? submit?.chainId ?? detail?.chain_id ?? "sui") as AgentChainId;
    const evmChainId = complete.evmChainId ?? submit?.evmChainId ?? readEvmChainIdFromDetail(detail ?? null);
    if (destDigest) {
      const label = explorerLinkLabel({ id: "lifi-complete", label: "Complete", chainId, evmChainId });
      const url = explorerUrlForDigest(destDigest, chainId, evmChainId);
      if (url) {
        return `Bridge complete. [View on ${label}](${url}) — Destination tx: ${destDigest}.`;
      }
      return `Bridge complete. Destination tx: ${destDigest}.`;
    }
    return "Bridge complete.";
  }

  if (submit?.status === "ok" && submit.digest) {
    const chainId = (submit.chainId ?? detail?.chain_id ?? "ethereum") as AgentChainId;
    const evmChainId = submit.evmChainId ?? readEvmChainIdFromDetail(detail ?? null);
    const label = explorerLinkLabel(submit);
    const url = explorerUrlForDigest(submit.digest, chainId, evmChainId);
    if (url) {
      return `Approved. Transaction submitted on ${chainId}. [View on ${label}](${url}) — Digest: ${submit.digest}.`;
    }
    return `Approved. Transaction submitted on ${chainId}. Digest: ${submit.digest}.`;
  }

  if (
    normalized.some(
      (step) =>
        (step.id === "lifi-submit" || step.id === "lifi-bridge") &&
        (step.status === "running" || step.status === "pending"),
    )
  ) {
    return LIFI_SUBMITTING_REPLY;
  }

  return null;
}

/** Merge Li-Fi steps and refresh bubble text/receipts without waiting for approve HTTP. */
export function applyLifiLiveUpdateToMessages<
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
  const withSteps = applyLifiTransactionStepsToMessages(messages, transactionId, steps, options);
  const index = findAgentMessageIndexForLifiTransaction(withSteps, transactionId);
  if (index < 0) {
    return withSteps;
  }

  const target = withSteps[index];
  const mergedSteps = target.executionSteps ?? [];
  const inFlight = mergedSteps.some(
    (step) =>
      (step.id === "lifi-submit" || step.id === "lifi-bridge") &&
      (step.status === "running" || step.status === "pending"),
  );
  const terminal = mergedSteps.find((step) => step.id === "lifi-complete");
  const isTerminal = terminal?.status === "ok" || terminal?.status === "failed";
  const liveReply = lifiLiveReplyFromSteps(mergedSteps, options?.detail ?? null);
  const shouldUpdateText =
    Boolean(liveReply) && (messageNeedsLiveLifiText(target.text) || isTerminal);

  let receipts = target.receipts;
  for (const step of mergedSteps) {
    const merged = mergeReceiptsFromExecutionStep(receipts, step);
    if (merged) {
      receipts = merged;
    }
  }

  return withSteps.map((message, messageIndex) => {
    if (messageIndex !== index) {
      return message;
    }
    return {
      ...message,
      ...(shouldUpdateText && liveReply ? { text: liveReply } : {}),
      streaming: inFlight && !isTerminal,
      statusCategory: "defi" as const,
      ...(receipts ? { receipts } : {}),
    };
  });
}

/** Immediate execution timeline when the user clicks Approve. */
export function applyOptimisticLifiApprovalToMessages<
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
  return applyLifiLiveUpdateToMessages(messages, pending.id, steps);
}

/** Fold approve outcome into the existing swap/bridge agent bubble (single timeline). */
export function foldApproveOutcomeIntoLifiMessage<
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
  outcome: {
    reply: string;
    steps?: ExecutionStep[];
    receipts?: Array<{ label: string; detail?: string; href?: string }>;
  },
): { messages: T[]; folded: boolean } {
  const index = findAgentMessageIndexForLifiTransaction(messages, transactionId);
  if (index < 0) {
    return { messages, folded: false };
  }

  const target = messages[index];
  const executionSteps = outcome.steps?.length
    ? normalizeLifiExecutionSteps(
        mergeExecutionSteps(target.executionSteps ?? [], outcome.steps),
      )
    : target.executionSteps
      ? normalizeLifiExecutionSteps(target.executionSteps)
      : undefined;

  const next = messages.map((message, messageIndex) => {
    if (messageIndex !== index) {
      return message;
    }
    return {
      ...message,
      text: outcome.reply,
      streaming: false,
      statusCategory: "defi" as const,
      ...(executionSteps ? { executionSteps } : {}),
      ...(outcome.receipts?.length
        ? { receipts: [...(message.receipts ?? []), ...outcome.receipts] }
        : {}),
    };
  });

  return { messages: next, folded: true };
}
