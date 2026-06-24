import type { AgentTransactionDetail, AgentTransactionListItem } from "@/lib/agent-transactions-api";
import type { AgentChainId } from "@/lib/agent-chains";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import { mergeExecutionSteps } from "@/lib/chat-execution-steps";

type LifiTrackingMeta = {
  route_id?: string;
  tx_hashes?: string[];
  from_chain_id?: AgentChainId;
  to_chain_id?: AgentChainId;
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
  const digest = tx.digest ?? tracking.tx_hashes?.[0];
  const meta = {
    agentTransactionId: tx.id,
    chainId,
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
