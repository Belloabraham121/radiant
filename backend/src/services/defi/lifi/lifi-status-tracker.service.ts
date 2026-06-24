import { prisma } from "../../../infrastructure/postgres/client.js";
import { findAgentTransactionById } from "../../agent-transaction/agent-transaction.repository.js";
import {
  markLifiTerminal,
  updateLifiTrackingProgress,
} from "../../agent-transaction/agent-transaction.service.js";
import { emitAgentStreamExecutionStep } from "../../agent/agent-stream-lifi.js";
import type { ExecutionProgressStep } from "../../agent/execution-progress.types.js";
import type { ChainId, TxResult } from "../../chains/types.js";
import { getLifiCrossChainStatus } from "./lifi-status.service.js";
import {
  formatLifiEtaLabel,
  isTerminalLifiStatus,
  lifiStatusInputFromTracking,
  mergeLifiStatusIntoTracking,
  readLifiTrackingFromTxResult,
} from "./lifi-tracking.js";
import type { LifiTrackJobInput, LifiTrackingMeta } from "./lifi-tracking.types.js";
import type { CrossChainStatusResult } from "./lifi.types.js";

const MAX_LOCAL_POLL_ATTEMPTS = 120;

function lifiExecutionSteps(input: {
  tracking: LifiTrackingMeta;
  transactionId: string;
  chainId: ChainId;
  digest?: string | null;
  terminal?: CrossChainStatusResult | null;
}): ExecutionProgressStep[] {
  const eta = formatLifiEtaLabel(input.tracking.estimated_duration_seconds);
  const meta = {
    agent_transaction_id: input.transactionId,
    chain_id: input.chainId,
    ...(input.digest ? { digest: input.digest } : {}),
    status_category: "defi" as const,
  };

  const steps: ExecutionProgressStep[] = [
    {
      id: "lifi-quote",
      status: "ok",
      label: "Route quoted",
      detail: input.tracking.bridge_tool
        ? `Via ${input.tracking.bridge_tool}`
        : "Cross-chain route ready",
      ...meta,
    },
    {
      id: "lifi-submit",
      status: "ok",
      label: "Submitting",
      detail: input.digest ? `Source tx · ${input.digest.slice(0, 10)}…` : "Source tx broadcast",
      ...meta,
    },
  ];

  const status = input.terminal?.status ?? input.tracking.tracking_status;
  if (status === "DONE") {
    const destDigest =
      input.terminal?.receiving_tx_hash ??
      input.tracking.receiving_tx_hash ??
      input.tracking.tx_hashes.at(-1) ??
      input.digest ??
      undefined;
    steps.push(
      {
        id: "lifi-bridge",
        status: "ok",
        label: eta,
        detail: input.tracking.substatus_message ?? "Bridge confirmed",
        ...meta,
      },
      {
        id: "lifi-complete",
        status: "ok",
        label: "Complete",
        detail: destDigest ? `Destination tx · ${destDigest.slice(0, 10)}…` : "Bridge complete",
        ...(destDigest ? { digest: destDigest } : {}),
        ...meta,
      },
    );
    return steps;
  }

  if (status === "FAILED" || status === "REFUNDED") {
    steps.push(
      {
        id: "lifi-bridge",
        status: "failed",
        label: eta,
        detail:
          input.tracking.substatus_message ??
          input.terminal?.substatus_message ??
          `Bridge ${status.toLowerCase()}`,
        ...meta,
      },
      {
        id: "lifi-complete",
        status: "failed",
        label: "Failed",
        detail: input.tracking.substatus_message ?? "Cross-chain transfer did not complete",
        ...meta,
      },
    );
    return steps;
  }

  steps.push({
    id: "lifi-bridge",
    status: "running",
    label: eta,
    detail:
      input.tracking.substatus_message ??
      input.terminal?.substatus_message ??
      "Waiting for destination confirmation",
    ...meta,
  });

  return steps;
}

function emitLifiSteps(
  sessionId: string | null | undefined,
  steps: ExecutionProgressStep[],
): void {
  if (!sessionId) {
    return;
  }
  for (const step of steps) {
    emitAgentStreamExecutionStep(sessionId, step);
  }
}

export async function applyLifiStatusUpdate(input: {
  transactionId: string;
  sessionId: string | null;
  chainId: ChainId;
  digest: string | null;
  tracking: LifiTrackingMeta;
  status: CrossChainStatusResult;
}): Promise<{ terminal: boolean }> {
  const merged = mergeLifiStatusIntoTracking(input.tracking, input.status);
  const steps = lifiExecutionSteps({
    tracking: merged,
    transactionId: input.transactionId,
    chainId: input.chainId,
    digest: input.digest,
    terminal: input.status,
  });
  emitLifiSteps(input.sessionId, steps);

  if (!isTerminalLifiStatus(input.status.status)) {
    await updateLifiTrackingProgress(input.transactionId, {
      digest: input.digest,
      effects_status: "pending",
      result: {
        chain_id: input.chainId,
        digest: input.digest ?? "",
        address: "",
        effects_status: "pending",
        lifi: merged,
      } as TxResult,
    });
    return { terminal: false };
  }

  const destDigest =
    input.status.receiving_tx_hash ??
    merged.tx_hashes.at(-1) ??
    input.digest ??
    "";

  await markLifiTerminal(input.transactionId, {
    status: input.status.status === "DONE" ? "success" : "failure",
    digest: destDigest || input.digest,
    effects_status: input.status.status === "DONE" ? "success" : "failure",
    result: {
      chain_id: input.chainId,
      digest: destDigest || input.digest || "",
      address: "",
      effects_status: input.status.status === "DONE" ? "success" : "failure",
      lifi: merged,
    } as TxResult,
    error:
      input.status.status === "DONE"
        ? undefined
        : {
            code: "LIFI_BRIDGE_FAILED",
            message:
              merged.substatus_message ??
              `Cross-chain transfer ${input.status.status.toLowerCase()}.`,
          },
  });

  return { terminal: true };
}

export async function pollLifiTransactionOnce(
  privyUserId: string,
  tracking: LifiTrackingMeta,
): Promise<CrossChainStatusResult> {
  return getLifiCrossChainStatus(
    privyUserId,
    lifiStatusInputFromTracking(tracking) as Parameters<typeof getLifiCrossChainStatus>[1],
  );
}

export async function runLifiTrackingPollCycle(input: LifiTrackJobInput): Promise<{
  terminal: boolean;
  status: string;
}> {
  const row = await findAgentTransactionById(input.transactionId);
  if (!row || row.status === "success" || row.status === "failure") {
    return { terminal: true, status: row?.status ?? "missing" };
  }

  const status = await pollLifiTransactionOnce(input.privyUserId, input.tracking);
  const outcome = await applyLifiStatusUpdate({
    transactionId: input.transactionId,
    sessionId: input.sessionId,
    chainId: row.chain_id as ChainId,
    digest: row.digest,
    tracking: input.tracking,
    status,
  });

  return { terminal: outcome.terminal, status: status.status };
}

export function startLocalLifiTrackingPoll(input: LifiTrackJobInput): void {
  let attempt = 0;

  const tick = async (): Promise<void> => {
    attempt += 1;
    try {
      const outcome = await runLifiTrackingPollCycle(input);
      if (outcome.terminal || attempt >= MAX_LOCAL_POLL_ATTEMPTS) {
        return;
      }
    } catch {
      if (attempt >= MAX_LOCAL_POLL_ATTEMPTS) {
        return;
      }
    }

    const delayMs = Math.min(10_000 * Math.pow(1.2, Math.floor(attempt / 5)), 60_000);
    setTimeout(() => {
      void tick();
    }, delayMs);
  };

  setTimeout(() => {
    void tick();
  }, 10_000);
}

export async function loadLifiTrackJobInput(
  transactionId: string,
  privyUserId: string,
): Promise<LifiTrackJobInput | null> {
  const row = await prisma.agentTransaction.findUnique({
    where: { id: transactionId },
    include: { user: { select: { privy_user_id: true } } },
  });
  if (!row || row.user.privy_user_id !== privyUserId) {
    return null;
  }

  const tracking = readLifiTrackingFromTxResult(row.result as TxResult | null);
  if (!tracking) {
    return null;
  }

  return {
    transactionId,
    privyUserId,
    sessionId: row.session_id,
    tracking,
  };
}

export function buildInitialLifiExecutionSteps(input: {
  tracking: LifiTrackingMeta;
  transactionId: string;
  chainId: ChainId;
  digest?: string | null;
}): ExecutionProgressStep[] {
  return lifiExecutionSteps({
    tracking: input.tracking,
    transactionId: input.transactionId,
    chainId: input.chainId,
    digest: input.digest,
  });
}

export { lifiExecutionSteps };
