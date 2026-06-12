import { randomUUID } from "node:crypto";
import { getAutoApproveMaxAtomic, getAutoApproveMaxDisplay } from "../../config/agent.js";
import type { ExecuteTransactionInput, ChainId } from "../chains/types.js";
import type { PendingTransaction } from "./agent.types.js";
import { runExecuteTransactionTool } from "./execute-transaction.tool.js";

const TRANSFER_ACTIONS = new Set([
  "transfer_native",
  "transfer_sui",
  "transfer",
  "transfer_eth",
  "transfer_sol",
]);

type PendingRecord = {
  privyUserId: string;
  input: ExecuteTransactionInput;
  pending: PendingTransaction;
  createdAt: number;
};

const pendingById = new Map<string, PendingRecord>();

const TTL_MS = 15 * 60 * 1000;

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, record] of pendingById) {
    if (now - record.createdAt > TTL_MS) {
      pendingById.delete(id);
    }
  }
}

function parseAmountAtomic(params: Record<string, unknown>): bigint | null {
  const raw = params.amount_atomic ?? params.amount_mist ?? params.amount_wei ?? params.amount_lamports;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return BigInt(raw);
}

function formatAmountDisplay(chainId: ChainId, amountAtomic: bigint): string {
  switch (chainId) {
    case "sui": {
      const sui = Number(amountAtomic) / 1_000_000_000;
      return `${sui.toFixed(4)} SUI`;
    }
    case "ethereum": {
      const eth = Number(amountAtomic) / 1e18;
      return `${eth.toFixed(6)} ETH`;
    }
    case "solana": {
      const sol = Number(amountAtomic) / 1_000_000_000;
      return `${sol.toFixed(4)} SOL`;
    }
    default:
      return amountAtomic.toString();
  }
}

export function transferRequiresApproval(input: ExecuteTransactionInput): boolean {
  if (!TRANSFER_ACTIONS.has(input.action)) {
    return false;
  }

  const amount = parseAmountAtomic(input.params);
  if (amount === null) {
    return true;
  }

  return amount > getAutoApproveMaxAtomic(input.chain_id);
}

export function createPendingTransaction(
  privyUserId: string,
  input: ExecuteTransactionInput,
): PendingTransaction {
  pruneExpired();

  const amount = parseAmountAtomic(input.params) ?? BigInt(0);
  const recipient =
    typeof input.params.recipient === "string" ? input.params.recipient : "unknown recipient";

  const pending: PendingTransaction = {
    id: randomUUID(),
    chain_id: input.chain_id,
    action: input.action,
    params: input.params,
    amount_display: formatAmountDisplay(input.chain_id, amount),
    summary: `Send ${formatAmountDisplay(input.chain_id, amount)} to ${recipient.slice(0, 12)}… on ${input.chain_id}`,
  };

  pendingById.set(pending.id, {
    privyUserId,
    input,
    pending,
    createdAt: Date.now(),
  });

  return pending;
}

export async function approvePendingTransaction(
  privyUserId: string,
  transactionId: string,
) {
  pruneExpired();
  const record = pendingById.get(transactionId);

  if (!record) {
    return null;
  }

  if (record.privyUserId !== privyUserId) {
    return null;
  }

  pendingById.delete(transactionId);
  const result = await runExecuteTransactionTool(privyUserId, record.input);
  return { pending: record.pending, result };
}

export function approvalThresholdLabel(chainId: ChainId): string {
  const max = getAutoApproveMaxDisplay(chainId);
  switch (chainId) {
    case "sui":
      return `${max} SUI`;
    case "ethereum":
      return `${max} ETH`;
    case "solana":
      return `${max} SOL`;
    default:
      return String(max);
  }
}

/** Test hook — clear in-memory pending transactions. */
export function clearPendingTransactionsForTests(): void {
  pendingById.clear();
}
