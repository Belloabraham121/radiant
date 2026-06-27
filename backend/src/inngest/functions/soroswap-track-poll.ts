import {
  pollSoroswapSwapOnce,
  applySoroswapStatusUpdate,
  loadSoroswapTrackTransaction,
} from "../../services/defi/soroswap/soroswap-status-tracker.service.js";
import { isTerminalSoroswapStatus } from "../../services/defi/soroswap/soroswap-normalize.js";
import type { ChainId, TxResult } from "../../services/chains/types.js";
import type { SoroswapTrackJobInput } from "../../services/defi/soroswap/soroswap-tracking.types.js";

export const MAX_SOROSWAP_POLL_ATTEMPTS = 120;

export function soroswapPollDelayMs(attempt: number): string {
  const seconds = Math.min(10 * Math.pow(1.2, Math.floor(attempt / 5)), 60);
  return `${Math.round(seconds)}s`;
}

type SoroswapTrackPollStep = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sleep: (id: string, duration: string) => Promise<void>;
};

function readSoroswapMetaFromTxResult(result: TxResult | null | undefined): {
  quote_id?: string;
  route_id?: string;
} {
  const meta = result?.soroswap;
  return {
    ...(meta?.quote_id ? { quote_id: meta.quote_id } : {}),
    ...(meta?.route_id ? { route_id: meta.route_id } : {}),
  };
}

export async function runSoroswapTrackPollLoop(
  step: SoroswapTrackPollStep,
  input: SoroswapTrackJobInput,
): Promise<{ terminal: boolean; status?: string; reason?: string; attempts?: number }> {
  let attempt = 0;

  while (attempt < MAX_SOROSWAP_POLL_ATTEMPTS) {
    const status = (await step.run(`poll-status-${attempt}`, async () =>
      pollSoroswapSwapOnce(input.txHash),
    )) as Awaited<ReturnType<typeof pollSoroswapSwapOnce>>;

    const row = (await step.run(`load-transaction-${attempt}`, async () =>
      loadSoroswapTrackTransaction(input.transactionId),
    )) as Awaited<ReturnType<typeof loadSoroswapTrackTransaction>>;

    if (!row) {
      return { terminal: true, reason: "transaction_missing" };
    }

    const meta = readSoroswapMetaFromTxResult(row.result as TxResult | null);
    const outcome = (await step.run(`apply-status-${attempt}`, async () =>
      applySoroswapStatusUpdate({
        transactionId: input.transactionId,
        sessionId: input.sessionId,
        chainId: row.chain_id as ChainId,
        digest: row.digest,
        txHash: input.txHash,
        status,
        quoteId: meta.quote_id,
        routeId: meta.route_id,
      }),
    )) as Awaited<ReturnType<typeof applySoroswapStatusUpdate>>;

    if (outcome.terminal || isTerminalSoroswapStatus(status.status)) {
      return { terminal: true, status: status.status, attempts: attempt + 1 };
    }

    await step.sleep(`wait-${attempt}`, soroswapPollDelayMs(attempt));
    attempt += 1;
  }

  return { terminal: false, reason: "max_attempts" };
}
