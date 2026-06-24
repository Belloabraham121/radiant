import { inngest } from "../client.js";
import { LIFI_TRACK_CROSS_CHAIN_EVENT } from "../events.js";
import {
  pollLifiTransactionOnce,
  applyLifiStatusUpdate,
} from "../../services/defi/lifi/lifi-status-tracker.service.js";
import { findAgentTransactionById } from "../../services/agent-transaction/agent-transaction.repository.js";
import { isTerminalLifiStatus } from "../../services/defi/lifi/lifi-tracking.js";
import type { ChainId } from "../../services/chains/types.js";
import type { LifiTrackJobInput } from "../../services/defi/lifi/lifi-tracking.types.js";

const MAX_POLL_ATTEMPTS = 120;

function pollDelayMs(attempt: number): string {
  const seconds = Math.min(10 * Math.pow(1.2, Math.floor(attempt / 5)), 60);
  return `${Math.round(seconds)}s`;
}

export const lifiTrackCrossChainFunction = inngest.createFunction(
  {
    id: "lifi-track-cross-chain",
    name: "Radiant Li-Fi cross-chain tracker",
    triggers: [{ event: LIFI_TRACK_CROSS_CHAIN_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const input = event.data as LifiTrackJobInput;
    let attempt = 0;

    while (attempt < MAX_POLL_ATTEMPTS) {
      const status = await step.run(`poll-status-${attempt}`, async () =>
        pollLifiTransactionOnce(input.privyUserId, input.tracking),
      );

      const row = await step.run(`load-transaction-${attempt}`, async () =>
        findAgentTransactionById(input.transactionId),
      );

      if (!row) {
        return { terminal: true, reason: "transaction_missing" };
      }

      const outcome = await step.run(`apply-status-${attempt}`, async () =>
        applyLifiStatusUpdate({
          transactionId: input.transactionId,
          sessionId: input.sessionId,
          chainId: row.chain_id as ChainId,
          digest: row.digest,
          tracking: input.tracking,
          status: status as Awaited<ReturnType<typeof pollLifiTransactionOnce>>,
        }),
      );

      if (outcome.terminal || isTerminalLifiStatus(status.status)) {
        return { terminal: true, status: status.status, attempts: attempt + 1 };
      }

      await step.sleep(`wait-${attempt}`, pollDelayMs(attempt));
      attempt += 1;
    }

    return { terminal: false, reason: "max_attempts" };
  },
);
