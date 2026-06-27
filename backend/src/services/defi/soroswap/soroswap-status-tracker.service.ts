import { findAgentTransactionById } from "../../agent-transaction/agent-transaction.repository.js";
import {
  markLifiTerminal,
  updateLifiTrackingProgress,
} from "../../agent-transaction/agent-transaction.service.js";
import type { ChainId, TxResult } from "../../chains/types.js";
import {
  isTerminalSoroswapStatus,
  normalizeSoroswapEffectsStatus,
} from "./soroswap-normalize.js";
import { getSoroswapSwapStatus } from "./soroswap-status.service.js";
import type { SoroswapTrackJobInput } from "./soroswap-tracking.types.js";
import type { SoroswapSwapStatusResult } from "./soroswap.types.js";
import {
  buildInitialSoroswapExecutionSteps,
  emitSoroswapExecutionSteps,
} from "../../agent/agent-stream-stellar.js";

const MAX_LOCAL_POLL_ATTEMPTS = 120;

type SoroswapStatusTrackerTestHooks = {
  pollOnce?: (txHash: string) => Promise<SoroswapSwapStatusResult>;
  findTransaction?: (
    transactionId: string,
  ) => Promise<Awaited<ReturnType<typeof findAgentTransactionById>>>;
  updateProgress?: typeof updateLifiTrackingProgress;
  markTerminal?: typeof markLifiTerminal;
};

let testHooks: SoroswapStatusTrackerTestHooks | null = null;

/** Test hook — mock Horizon polling and agent transaction persistence. */
export function setSoroswapStatusTrackerHooksForTests(
  hooks: SoroswapStatusTrackerTestHooks | null,
): void {
  testHooks = hooks;
}

export async function loadSoroswapTrackTransaction(
  transactionId: string,
): Promise<Awaited<ReturnType<typeof findAgentTransactionById>>> {
  if (testHooks?.findTransaction) {
    return testHooks.findTransaction(transactionId);
  }
  return findAgentTransactionById(transactionId);
}

function buildSoroswapTxResult(input: {
  chainId: ChainId;
  digest: string;
  effectsStatus: TxResult["effects_status"];
  status: SoroswapSwapStatusResult;
  quoteId?: string;
  routeId?: string;
}): TxResult {
  return {
    chain_id: input.chainId,
    digest: input.digest,
    address: "",
    effects_status: input.effectsStatus,
    soroswap: {
      tx_hash: input.status.tx_hash,
      quote_id: input.quoteId,
      route_id: input.routeId,
      tracking_status: input.status.status,
      ...(typeof input.status.ledger === "number" ? { ledger: input.status.ledger } : {}),
    },
  };
}

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

export async function applySoroswapStatusUpdate(input: {
  transactionId: string;
  sessionId: string | null;
  chainId: ChainId;
  digest: string | null;
  txHash: string;
  status: SoroswapSwapStatusResult;
  quoteId?: string;
  routeId?: string;
}): Promise<{ terminal: boolean }> {
  const effectsStatus = normalizeSoroswapEffectsStatus(input.status.status);
  const digest = input.digest ?? input.txHash;
  const txResult = buildSoroswapTxResult({
    chainId: input.chainId,
    digest,
    effectsStatus,
    status: input.status,
    quoteId: input.quoteId,
    routeId: input.routeId,
  });

  const trackingStatus =
    input.status.status === "success"
      ? "success"
      : input.status.status === "failed"
        ? "failed"
        : "pending";

  emitSoroswapExecutionSteps(
    input.sessionId,
    buildInitialSoroswapExecutionSteps({
      transaction_id: input.transactionId,
      digest,
      token_in: undefined,
      token_out: undefined,
      quote_id: input.quoteId,
      tracking_status: trackingStatus,
    }),
  );

  if (!isTerminalSoroswapStatus(input.status.status)) {
    const updateProgress = testHooks?.updateProgress ?? updateLifiTrackingProgress;
    await updateProgress(input.transactionId, {
      digest,
      effects_status: effectsStatus,
      result: txResult,
    });
    return { terminal: false };
  }

  const success = input.status.status === "success";
  const markTerminal = testHooks?.markTerminal ?? markLifiTerminal;
  await markTerminal(input.transactionId, {
    status: success ? "success" : "failure",
    digest,
    effects_status: effectsStatus,
    result: txResult,
    error: success
      ? undefined
      : {
          code: "SOROSWAP_SWAP_FAILED",
          message: "Stellar swap transaction failed on-chain.",
        },
  });

  return { terminal: true };
}

export async function pollSoroswapSwapOnce(txHash: string): Promise<SoroswapSwapStatusResult> {
  if (testHooks?.pollOnce) {
    return testHooks.pollOnce(txHash);
  }
  return getSoroswapSwapStatus(txHash);
}

export async function runSoroswapTrackingPollCycle(input: SoroswapTrackJobInput): Promise<{
  terminal: boolean;
  status: string;
}> {
  const row = await loadSoroswapTrackTransaction(input.transactionId);
  if (!row || row.status === "success" || row.status === "failure") {
    return { terminal: true, status: row?.status ?? "missing" };
  }

  const status = await pollSoroswapSwapOnce(input.txHash);
  const meta = readSoroswapMetaFromTxResult(row.result as TxResult | null);
  const outcome = await applySoroswapStatusUpdate({
    transactionId: input.transactionId,
    sessionId: input.sessionId,
    chainId: row.chain_id as ChainId,
    digest: row.digest,
    txHash: input.txHash,
    status,
    quoteId: meta.quote_id,
    routeId: meta.route_id,
  });

  return { terminal: outcome.terminal, status: status.status };
}

export function startLocalSoroswapTrackingPoll(input: SoroswapTrackJobInput): void {
  let attempt = 0;

  const finalizeOnExhaustion = async (): Promise<void> => {
    const row = await loadSoroswapTrackTransaction(input.transactionId);
    if (!row || row.status === "success" || row.status === "failure") {
      return;
    }

    const meta = readSoroswapMetaFromTxResult(row.result as TxResult | null);
    await applySoroswapStatusUpdate({
      transactionId: input.transactionId,
      sessionId: input.sessionId,
      chainId: row.chain_id as ChainId,
      digest: row.digest ?? input.txHash,
      txHash: input.txHash,
      status: { tx_hash: input.txHash, status: "failed" },
      quoteId: meta.quote_id,
      routeId: meta.route_id,
    });
  };

  const tick = async (): Promise<void> => {
    attempt += 1;
    try {
      const outcome = await runSoroswapTrackingPollCycle(input);
      if (outcome.terminal) {
        return;
      }
      if (attempt >= MAX_LOCAL_POLL_ATTEMPTS) {
        await finalizeOnExhaustion();
        return;
      }
    } catch {
      if (attempt >= MAX_LOCAL_POLL_ATTEMPTS) {
        await finalizeOnExhaustion();
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
