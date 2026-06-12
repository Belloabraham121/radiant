import { randomUUID } from "node:crypto";
import { getDeepBookEnv } from "../../config/deepbook.js";
import {
  estimateSwapNotionalSui,
  isDeepBookSwapAction,
  parseDeepBookSwapParams,
} from "../defi/deepbook-swap.service.js";
import type { ExecuteTransactionInput, ChainId } from "../chains/types.js";
import type { PendingTransaction } from "./agent.types.js";
import type { TxResult } from "../chains/types.js";
import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import { runExecuteTransactionTool } from "./execute-transaction.tool.js";
import {
  getAgentPermissions,
  resolveAutoApproveMaxAtomic,
  resolveAutoApproveMaxDisplay,
  type AgentPermissions,
} from "./agent-permissions.service.js";
import {
  checkManagerBalance,
  getDeepBookManagerInfo,
  parseDeepBookDepositWithdrawParams,
} from "../defi/deepbook-balance-manager.service.js";
import {
  isDeepBookProvisionAction,
  validateExecuteTransactionInput,
} from "./validate-execute-transaction.js";

const TRANSFER_ACTIONS = new Set([
  "transfer_native",
  "transfer_sui",
  "transfer",
  "transfer_eth",
  "transfer_sol",
]);

const DEEPBOOK_WRITE_ACTIONS = new Set(["deepbook_deposit", "deepbook_withdraw"]);
const DEEPBOOK_PROVISION_ACTIONS = new Set(["deepbook_provision_manager"]);

const MUTATING_EXECUTE_ACTIONS = new Set([
  ...TRANSFER_ACTIONS,
  ...DEEPBOOK_WRITE_ACTIONS,
  ...DEEPBOOK_PROVISION_ACTIONS,
  "swap",
  "deepbook_swap",
  "execute_bytes",
]);

function isMutatingExecuteAction(action: string): boolean {
  return isDeepBookSwapAction(action) || MUTATING_EXECUTE_ACTIONS.has(action);
}

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

export function swapRequiresApprovalWithPermissions(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!isDeepBookSwapAction(input.action) || input.chain_id !== "sui") {
    return false;
  }

  if (!permissions.auto_approve_enabled) {
    return true;
  }

  try {
    const parsed = parseDeepBookSwapParams(input.params);
    const price =
      typeof input.params.estimated_price === "number" ? input.params.estimated_price : null;
    const poolDef = getDeepBookEnv().pools[parsed.pool_key as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
    const inputCoin =
      parsed.side === "sell" ? (poolDef?.baseCoin ?? "SUI") : (poolDef?.quoteCoin ?? "USDC");

    let suiPerInput: number | null = null;
    if (inputCoin.toUpperCase() === "SUI") {
      suiPerInput = 1;
    } else if (price && price > 0) {
      suiPerInput = parsed.side === "sell" ? 1 / price : price;
    }

    const notionalSui = estimateSwapNotionalSui(inputCoin, parsed.amount, suiPerInput);
    return notionalSui > resolveAutoApproveMaxDisplay(permissions, "sui");
  } catch {
    return true;
  }
}

export function transferRequiresApprovalWithPermissions(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!permissions.auto_approve_enabled && isMutatingExecuteAction(input.action)) {
    return true;
  }

  if (DEEPBOOK_WRITE_ACTIONS.has(input.action) || DEEPBOOK_PROVISION_ACTIONS.has(input.action)) {
    return true;
  }

  if (isDeepBookSwapAction(input.action)) {
    return swapRequiresApprovalWithPermissions(permissions, input);
  }

  if (!TRANSFER_ACTIONS.has(input.action)) {
    return false;
  }

  if (!permissions.auto_approve_enabled) {
    return true;
  }

  const amount = parseAmountAtomic(input.params);
  if (amount === null) {
    return true;
  }

  return amount > resolveAutoApproveMaxAtomic(permissions, input.chain_id);
}

export async function transferRequiresApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<boolean> {
  if (isDeepBookProvisionAction(input.action)) {
    const info = await getDeepBookManagerInfo(privyUserId);
    if (info.provisioned) {
      return false;
    }
  }

  const permissions = await getAgentPermissions(privyUserId);
  return transferRequiresApprovalWithPermissions(permissions, input);
}

export async function createPendingTransaction(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<PendingTransaction> {
  validateExecuteTransactionInput(input);
  pruneExpired();

  const amount = parseAmountAtomic(input.params) ?? BigInt(0);
  const recipient =
    typeof input.params.recipient === "string" ? input.params.recipient : "unknown recipient";

  let summary = `Send ${formatAmountDisplay(input.chain_id, amount)} to ${recipient.slice(0, 12)}… on ${input.chain_id}`;
  let amountDisplay = formatAmountDisplay(input.chain_id, amount);

  if (isDeepBookProvisionAction(input.action)) {
    summary = "Create DeepBook balance manager";
    amountDisplay = "Network fee only (~0.01 SUI)";
  } else if (DEEPBOOK_WRITE_ACTIONS.has(input.action)) {
    const parsed = parseDeepBookDepositWithdrawParams(input.params);
    if (parsed.withdraw_all && input.action === "deepbook_withdraw") {
      try {
        const balance = await checkManagerBalance(privyUserId, parsed.coin_key);
        amountDisplay =
          balance.balance_display > 0
            ? `all ${parsed.coin_key} (${balance.balance_display} ${parsed.coin_key})`
            : `all ${parsed.coin_key}`;
      } catch {
        amountDisplay = `all ${parsed.coin_key}`;
      }
    } else {
      amountDisplay = `${parsed.amount_display} ${parsed.coin_key}`;
    }
    const verb = input.action === "deepbook_deposit" ? "Deposit" : "Withdraw";
    summary = `${verb} ${amountDisplay} via DeepBook balance manager`;
  } else if (isDeepBookSwapAction(input.action)) {
    try {
      const parsed = parseDeepBookSwapParams(input.params);
      const poolDef =
        getDeepBookEnv().pools[parsed.pool_key as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
      const inputCoin =
        parsed.side === "sell"
          ? (poolDef?.baseCoin ?? "base")
          : (poolDef?.quoteCoin ?? "quote");
      const outputCoin =
        parsed.side === "sell"
          ? (poolDef?.quoteCoin ?? "quote")
          : (poolDef?.baseCoin ?? "base");
      const estOut =
        typeof input.params.estimated_out_display === "number"
          ? input.params.estimated_out_display
          : null;
      amountDisplay = `${parsed.amount} ${inputCoin} → ${estOut !== null ? `~${estOut} ` : ""}${outputCoin}`;
      summary = `Swap on DeepBook (${parsed.pool_key})`;
    } catch {
      amountDisplay = "DeepBook swap";
      summary = "Swap via DeepBook";
    }
  }

  const pending: PendingTransaction = {
    id: randomUUID(),
    chain_id: input.chain_id,
    action: input.action,
    params: input.params,
    amount_display: amountDisplay,
    summary,
  };

  pendingById.set(pending.id, {
    privyUserId,
    input,
    pending,
    createdAt: Date.now(),
  });

  return pending;
}

export type ApprovalResult =
  | { ok: true; pending: PendingTransaction; result: TxResult }
  | { ok: false; pending: PendingTransaction; error: AppError };

export async function approvePendingTransaction(
  privyUserId: string,
  transactionId: string,
): Promise<ApprovalResult | null> {
  pruneExpired();
  const record = pendingById.get(transactionId);

  if (!record) {
    return null;
  }

  if (record.privyUserId !== privyUserId) {
    return null;
  }

  pendingById.delete(transactionId);

  try {
    const result = await runExecuteTransactionTool(privyUserId, record.input);
    return { ok: true, pending: record.pending, result };
  } catch (err) {
    return { ok: false, pending: record.pending, error: mapAgentToolError(err) };
  }
}

/** Test hook — clear in-memory pending transactions. */
export function clearPendingTransactionsForTests(): void {
  pendingById.clear();
}
