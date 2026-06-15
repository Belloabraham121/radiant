import { randomUUID } from "node:crypto";
import { getDeepBookEnv } from "../../config/deepbook.js";
import {
  estimateSwapNotionalSui,
  isDeepBookSwapAction,
  parseDeepBookSwapParams,
} from "../defi/deepbook/deepbook-swap.service.js";
import {
  estimatePlaceOrderNotionalSui,
  isDeepBookCancelOrderAction,
  isDeepBookOrderAction,
  isDeepBookPlaceOrderAction,
} from "../defi/deepbook/deepbook-orders.service.js";
import {
  isDeepBookFlashLoanAction,
  parseDeepBookFlashLoanParams,
} from "../defi/deepbook/deepbook-flash-loan.service.js";
import {
  isDeepBookStakeAction,
} from "../defi/deepbook/deepbook-stake.service.js";
import {
  isDeepBookGovernanceAction,
} from "../defi/deepbook/deepbook-governance.service.js";
import type { FlashLoanRepaySource } from "../defi/deepbook/deepbook-flash-loan.types.js";
import type { ExecuteTransactionInput, TxResult } from "../chains/types.js";
import type { PinnedAppScope } from "../projects/pinned-app-scope.types.js";
import type { PendingTransaction } from "./agent.types.js";
import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import { runExecuteTransactionTool } from "./execute-transaction.tool.js";
import {
  getAgentPermissions,
  resolveAutoApproveMaxAtomic,
  resolveAutoApproveMaxDisplay,
} from "./agent-permissions.service.js";
import type { AgentPermissions } from "./agent-permissions.types.js";
import { getDeepBookManagerInfo } from "../defi/deepbook/deepbook-balance-manager.service.js";
import {
  isDeepBookProvisionAction,
  validateExecuteTransactionInput,
} from "./deepbook/validate-execute-transaction.js";
import { buildTransactionDisplay } from "../agent-transaction/deepbook/build-display.js";
import {
  enrichSwapExecuteInputForApproval,
  isSwapQuoteExpired,
  readQuoteExpiresAt,
} from "./deepbook/swap-quote-enrichment.js";
import {
  claimPendingApprovalForUser,
  claimPendingRejectionForUser,
  clearPendingApprovalsForTests,
  executeInputFromRecord,
  expireStalePendingApprovals,
  markCompleted,
  pendingTransactionFromRecord,
  recordPendingApproval,
} from "../agent-transaction/agent-transaction.service.js";
import type { ExecuteTransactionContext } from "./execute-transaction-context.js";

const TRANSFER_ACTIONS = new Set([
  "transfer_native",
  "transfer_sui",
  "transfer",
  "transfer_eth",
  "transfer_sol",
]);

const DEEPBOOK_WRITE_ACTIONS = new Set(["deepbook_deposit", "deepbook_withdraw"]);
const DEEPBOOK_SETTLED_ACTIONS = new Set([
  "deepbook_withdraw_settled_amounts",
  "deepbook_withdraw_settled_amounts_permissionless",
]);
const DEEPBOOK_PROVISION_ACTIONS = new Set(["deepbook_provision_manager"]);

const MUTATING_EXECUTE_ACTIONS = new Set([
  ...TRANSFER_ACTIONS,
  ...DEEPBOOK_WRITE_ACTIONS,
  ...DEEPBOOK_PROVISION_ACTIONS,
  "swap",
  "deepbook_swap",
  "deepbook_place_limit_order",
  "deepbook_place_market_order",
  "deepbook_cancel_order",
  "deepbook_cancel_orders",
  "deepbook_cancel_all_orders",
  "deepbook_modify_order",
  "deepbook_withdraw_settled_amounts",
  "deepbook_withdraw_settled_amounts_permissionless",
  "deepbook_flash_loan",
  "deepbook_stake",
  "deepbook_unstake",
  "deepbook_submit_proposal",
  "deepbook_vote",
  "execute_bytes",
]);

function isMutatingExecuteAction(action: string): boolean {
  return (
    isDeepBookSwapAction(action) ||
    isDeepBookOrderAction(action) ||
    isDeepBookFlashLoanAction(action) ||
    isDeepBookStakeAction(action) ||
    isDeepBookGovernanceAction(action) ||
    MUTATING_EXECUTE_ACTIONS.has(action)
  );
}

async function pruneExpired(): Promise<void> {
  await expireStalePendingApprovals();
}

export async function buildPendingTransactionPreview(
  privyUserId: string,
  input: ExecuteTransactionInput,
  id = randomUUID(),
): Promise<PendingTransaction> {
  const enriched = await enrichSwapExecuteInputForApproval(privyUserId, input);
  validateExecuteTransactionInput(enriched);
  const { title, amount_display: amountDisplay } = await buildTransactionDisplay(
    privyUserId,
    enriched,
  );

  return {
    id,
    chain_id: enriched.chain_id,
    action: enriched.action,
    params: enriched.params,
    amount_display: amountDisplay,
    summary: title,
    quote_expires_at: readQuoteExpiresAt(enriched.params),
  };
}

function parseAmountAtomic(params: Record<string, unknown>): bigint | null {
  const raw = params.amount_atomic ?? params.amount_mist ?? params.amount_wei ?? params.amount_lamports;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return BigInt(raw);
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

export function orderRequiresApprovalWithPermissions(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!isDeepBookPlaceOrderAction(input.action) || input.chain_id !== "sui") {
    return false;
  }

  if (!permissions.auto_approve_enabled) {
    return true;
  }

  try {
    const price =
      typeof input.params.estimated_price === "number" ? input.params.estimated_price : null;
    const notionalSui = estimatePlaceOrderNotionalSui(input.action, input.params, price);
    return notionalSui > resolveAutoApproveMaxDisplay(permissions, "sui");
  } catch {
    return true;
  }
}

export function flashLoanRequiresApproval(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!permissions.allow_flash_loans) {
    return true;
  }

  try {
    const parsed = parseDeepBookFlashLoanParams(input.params);
    const repaySource: FlashLoanRepaySource = parsed.repay_source;
    if (repaySource === "wallet" || repaySource === "merged") {
      return true;
    }
    return !permissions.auto_approve_flash_loans;
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

  if (isDeepBookFlashLoanAction(input.action)) {
    return flashLoanRequiresApproval(permissions, input);
  }

  if (isDeepBookStakeAction(input.action)) {
    return true;
  }

  if (isDeepBookGovernanceAction(input.action)) {
    return true;
  }

  if (
    DEEPBOOK_WRITE_ACTIONS.has(input.action) ||
    DEEPBOOK_PROVISION_ACTIONS.has(input.action) ||
    DEEPBOOK_SETTLED_ACTIONS.has(input.action)
  ) {
    return true;
  }

  if (input.action === "deepbook_modify_order") {
    return true;
  }

  if (isDeepBookSwapAction(input.action)) {
    return swapRequiresApprovalWithPermissions(permissions, input);
  }

  if (isDeepBookCancelOrderAction(input.action)) {
    return true;
  }

  if (isDeepBookPlaceOrderAction(input.action)) {
    return orderRequiresApprovalWithPermissions(permissions, input);
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
  options: { pinnedAppScope?: PinnedAppScope | null } = {},
): Promise<boolean> {
  if (options.pinnedAppScope && isDeepBookSwapAction(input.action)) {
    return true;
  }

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
  context?: ExecuteTransactionContext,
): Promise<PendingTransaction> {
  await pruneExpired();

  const pending = await buildPendingTransactionPreview(privyUserId, input);

  await recordPendingApproval({
    privyUserId,
    sessionId: context?.sessionId,
    messageId: context?.messageId,
    workflowStepIndex: context?.workflowStepIndex,
    input: {
      chain_id: pending.chain_id,
      action: pending.action,
      params: pending.params,
    },
    pending,
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
  await pruneExpired();

  const claimed = await claimPendingApprovalForUser(privyUserId, transactionId);
  if (!claimed) {
    return null;
  }

  const pending = pendingTransactionFromRecord(claimed);
  const executeInput = executeInputFromRecord(claimed);

  if (isDeepBookSwapAction(executeInput.action) && isSwapQuoteExpired(executeInput.params)) {
    const error = new AppError(
      400,
      "QUOTE_EXPIRED",
      "This swap quote expired. Cancel and ask again to get a fresh rate before approving.",
    );
    await markCompleted(transactionId, {
      kind: "failure",
      error: { code: error.code, message: error.message },
    });
    return { ok: false, pending, error };
  }

  try {
    const result = await runExecuteTransactionTool(privyUserId, executeInput);
    await markCompleted(transactionId, { kind: "success", result });
    return { ok: true, pending, result };
  } catch (err) {
    const error = mapAgentToolError(err);
    await markCompleted(transactionId, {
      kind: "failure",
      error: { code: error.code, message: error.message },
    });
    return { ok: false, pending, error };
  }
}

export async function rejectPendingTransaction(
  privyUserId: string,
  transactionId: string,
): Promise<PendingTransaction | null> {
  await pruneExpired();

  const rejected = await claimPendingRejectionForUser(privyUserId, transactionId);
  if (!rejected) {
    return null;
  }

  return pendingTransactionFromRecord(rejected);
}

/** Test hook — clear pending approval rows from the database. */
export async function clearPendingTransactionsForTests(): Promise<void> {
  await clearPendingApprovalsForTests();
}
