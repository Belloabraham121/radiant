import { prisma } from "../../../infrastructure/postgres/client.js";
import { findAgentTransactionById } from "../../agent-transaction/agent-transaction.repository.js";
import {
  markLifiTerminal,
  updateLifiTrackingProgress,
} from "../../agent-transaction/agent-transaction.service.js";
import type { ChainId, TxResult } from "../../chains/types.js";
import { getSquidCrossChainStatus } from "./squid-status.service.js";
import {
  isTerminalSquidStatus,
  mergeSquidStatusIntoTracking,
  readSquidTrackingFromTxResult,
  squidStatusInputFromTracking,
} from "./squid-tracking.js";
import type { SquidTrackJobInput, SquidTrackingMeta } from "./squid-tracking.types.js";
import type { SquidCrossChainStatusResult } from "./squid.types.js";

const MAX_LOCAL_POLL_ATTEMPTS = 120;

export async function applySquidStatusUpdate(input: {
  transactionId: string;
  sessionId: string | null;
  chainId: ChainId;
  digest: string | null;
  tracking: SquidTrackingMeta;
  status: SquidCrossChainStatusResult;
}): Promise<{ terminal: boolean }> {
  const merged = mergeSquidStatusIntoTracking(input.tracking, input.status);

  if (!isTerminalSquidStatus(input.status.status)) {
    await updateLifiTrackingProgress(input.transactionId, {
      digest: input.digest,
      effects_status: "pending",
      result: {
        chain_id: input.chainId,
        digest: input.digest ?? "",
        address: "",
        effects_status: "pending",
        squid: merged,
      } as TxResult,
    });
    return { terminal: false };
  }

  const destDigest =
    input.status.receiving_tx_hash ??
    merged.tx_hashes.at(-1) ??
    input.digest ??
    "";

  const success = input.status.status === "SUCCESS" || input.status.status === "PARTIAL_SUCCESS";

  await markLifiTerminal(input.transactionId, {
    status: success ? "success" : "failure",
    digest: destDigest || input.digest,
    effects_status: success ? "success" : "failure",
    result: {
      chain_id: input.chainId,
      digest: destDigest || input.digest || "",
      address: "",
      effects_status: success ? "success" : "failure",
      squid: merged,
    } as TxResult,
    error: success
      ? undefined
      : {
          code: "SQUID_BRIDGE_FAILED",
          message:
            merged.substatus_message ??
            `Cross-chain transfer ${input.status.status.toLowerCase()}.`,
        },
  });

  return { terminal: true };
}

export async function pollSquidTransactionOnce(
  privyUserId: string,
  tracking: SquidTrackingMeta,
): Promise<SquidCrossChainStatusResult> {
  return getSquidCrossChainStatus(
    privyUserId,
    squidStatusInputFromTracking(tracking) as Parameters<typeof getSquidCrossChainStatus>[1],
  );
}

export async function runSquidTrackingPollCycle(input: SquidTrackJobInput): Promise<{
  terminal: boolean;
  status: string;
}> {
  const row = await findAgentTransactionById(input.transactionId);
  if (!row || row.status === "success" || row.status === "failure") {
    return { terminal: true, status: row?.status ?? "missing" };
  }

  const status = await pollSquidTransactionOnce(input.privyUserId, input.tracking);
  const outcome = await applySquidStatusUpdate({
    transactionId: input.transactionId,
    sessionId: input.sessionId,
    chainId: row.chain_id as ChainId,
    digest: row.digest,
    tracking: input.tracking,
    status,
  });

  return { terminal: outcome.terminal, status: status.status };
}

export function startLocalSquidTrackingPoll(input: SquidTrackJobInput): void {
  let attempt = 0;

  const tick = async (): Promise<void> => {
    attempt += 1;
    try {
      const outcome = await runSquidTrackingPollCycle(input);
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

export async function loadSquidTrackJobInput(
  transactionId: string,
  privyUserId: string,
): Promise<SquidTrackJobInput | null> {
  const row = await prisma.agentTransaction.findUnique({
    where: { id: transactionId },
    include: { user: { select: { privy_user_id: true } } },
  });
  if (!row || row.user.privy_user_id !== privyUserId) {
    return null;
  }

  const tracking = readSquidTrackingFromTxResult(row.result as TxResult | null);
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
