import { AppError } from "../../../errors/app-error.js";
import { getHorizonServer } from "../../../infrastructure/stellar/client.js";
import { withStellarRpcRetry } from "../../../infrastructure/stellar/rpc-retry.js";
import {
  normalizeSoroswapTxStatus,
  type SoroswapHorizonTxSnapshot,
} from "./soroswap-normalize.js";
import type { SoroswapSwapStatusResult } from "./soroswap.types.js";

type FetchHorizonTxFn = (txHash: string) => Promise<SoroswapHorizonTxSnapshot | null>;

let fetchHorizonTxForTests: FetchHorizonTxFn | null = null;

/** Test hook — mock Horizon transaction lookup. */
export function setSoroswapStatusHorizonHookForTests(fn: FetchHorizonTxFn | null): void {
  fetchHorizonTxForTests = fn;
}

function isHorizonNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const record = err as { response?: { status?: number }; status?: number };
  return record.response?.status === 404 || record.status === 404 || /not found|404/i.test(
    err instanceof Error ? err.message : String(err),
  );
}

async function fetchHorizonTransaction(txHash: string): Promise<SoroswapHorizonTxSnapshot | null> {
  if (fetchHorizonTxForTests) {
    return fetchHorizonTxForTests(txHash);
  }

  const horizon = getHorizonServer();
  try {
    const tx = await withStellarRpcRetry(() =>
      horizon.transactions().transaction(txHash).call(),
    );
    return {
      successful: tx.successful,
      ledger: typeof tx.ledger === "number" ? tx.ledger : Number(tx.ledger),
    };
  } catch (err) {
    if (isHorizonNotFound(err)) {
      return null;
    }
    throw err;
  }
}

/** Poll Horizon for a Soroswap swap transaction status. */
export async function getSoroswapSwapStatus(txHash: string): Promise<SoroswapSwapStatusResult> {
  const normalizedHash = txHash.trim();
  if (!normalizedHash) {
    throw new AppError(400, "VALIDATION_ERROR", "txHash is required.", { field: "txHash" });
  }

  const tx = await fetchHorizonTransaction(normalizedHash);
  const status = normalizeSoroswapTxStatus(tx);

  return {
    tx_hash: normalizedHash,
    status,
    ...(typeof tx?.ledger === "number" ? { ledger: tx.ledger } : {}),
    ...(typeof tx?.successful === "boolean" ? { successful: tx.successful } : {}),
  };
}
