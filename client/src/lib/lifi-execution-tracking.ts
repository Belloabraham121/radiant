import type { AgentTransactionDetail, AgentTransactionListItem } from "@/lib/agent-transactions-api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { PendingTransaction } from "@/lib/chat-api";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import { mergeExecutionSteps } from "@/lib/chat-execution-steps";

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
        label: "Routequoted",
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
  tracking_status?: string | null;
  substatus_message?: string | null;
  receiving_tx_hash?: string | null;
};

function formatLifiEtaLabel(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) {
    return "Bridging";
  }
  if (seconds < 60) {
    return `Bridging (~${Math.max(1, Math.round(seconds))}s)`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `Bridging (~${minutes}m)`;
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
  const evmChainId = tracking.from_evm_chain_id;
  const digest = tx.digest ?? tracking.tx_hashes?.[0];
  const meta = {
    agentTransactionId: tx.id,
    chainId,
    ...(evmChainId !== undefined ? { evmChainId } : {}),
    ...(digest ? { digest } : {}),
  };

  const eta = formatLifiEtaLabel(tracking.estimated_duration_seconds);
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
        label: eta,
        detail: tracking.substatus_message ?? "Bridge confirmed",
        ...meta,
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
        label: eta,
        detail: tracking.substatus_message ?? "Bridge failed",
        ...meta,
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
    label: eta,
    detail: tracking.substatus_message ?? "Waiting for destination confirmation",
    ...meta,
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

export function isInFlightLifiTransaction(tx: AgentTransactionListItem): boolean {
  return tx.status === "submitted" && tx.effects_status === "pending";
}
