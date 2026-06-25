import {
  pollLifiTransactionOnce,
  applyLifiStatusUpdate,
} from "../../services/defi/lifi/lifi-status-tracker.service.js";
import { findAgentTransactionById } from "../../services/agent-transaction/agent-transaction.repository.js";
import { isTerminalLifiStatus } from "../../services/defi/lifi/lifi-tracking.js";
import type { ChainId } from "../../services/chains/types.js";
import type { LifiTrackJobInput } from "../../services/defi/lifi/lifi-tracking.types.js";

export const MAX_LIFI_POLL_ATTEMPTS = 120;

export function lifiPollDelayMs(attempt: number): string {
  const seconds = Math.min(10 * Math.pow(1.2, Math.floor(attempt / 5)), 60);
  return `${Math.round(seconds)}s`;
}

type LifiTrackPollStep = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sleep: (id: string, duration: string) => Promise<void>;
};

export async function runLifiTrackPollLoop(
  step: LifiTrackPollStep,
  input: LifiTrackJobInput,
): Promise<{ terminal: boolean; status?: string; reason?: string; attempts?: number }> {
  let attempt = 0;

  while (attempt < MAX_LIFI_POLL_ATTEMPTS) {
    const status = (await step.run(`poll-status-${attempt}`, async () =>
      pollLifiTransactionOnce(input.privyUserId, input.tracking),
    )) as Awaited<ReturnType<typeof pollLifiTransactionOnce>>;

    const row = (await step.run(`load-transaction-${attempt}`, async () =>
      findAgentTransactionById(input.transactionId),
    )) as Awaited<ReturnType<typeof findAgentTransactionById>>;

    if (!row) {
      return { terminal: true, reason: "transaction_missing" };
    }

    const outcome = (await step.run(`apply-status-${attempt}`, async () =>
      applyLifiStatusUpdate({
        transactionId: input.transactionId,
        sessionId: input.sessionId,
        chainId: row.chain_id as ChainId,
        digest: row.digest,
        tracking: input.tracking,
        status,
      }),
    )) as Awaited<ReturnType<typeof applyLifiStatusUpdate>>;

    if (outcome.terminal || isTerminalLifiStatus(status.status)) {
      return { terminal: true, status: status.status, attempts: attempt + 1 };
    }

    await step.sleep(`wait-${attempt}`, lifiPollDelayMs(attempt));
    attempt += 1;
  }

  return { terminal: false, reason: "max_attempts" };
}
