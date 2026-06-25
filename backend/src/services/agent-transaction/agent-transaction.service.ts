import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { parseChainId } from "../chains/registry.js";
import { readDeFiQuoteExpiresAt } from "../agent-transaction/approval-preview/quote-expiry.js";
import {
  isPendingApprovalExpired,
} from "../defi/lifi/lifi-continuation-pending.js";
import type { ChainId, ExecuteTransactionInput, TxResult } from "../chains/types.js";
import type { PendingTransaction } from "../agent/agent.types.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import { buildTransactionDisplay, enrichDisplayFromResult } from "./deepbook/build-display.js";
import { formatAgentTransactionsForChat } from "./format-for-chat.js";
import { categorizeAgentTransactionAction } from "./deepbook/categorize-action.js";
import { buildExplorerTxUrl } from "./explorer-url.js";
import { sanitizeErrorMessageForUi } from "./sanitize-error-message.js";
import {
  createAgentTransaction,
  claimAgentTransactionStatus,
  deletePendingApprovalsForTests,
  expirePendingApprovalsOlderThan,
  findAgentTransactionById,
  findAgentTransactionByIdForUser,
  findAgentTransactionsBySessionForUser,
  findPendingApprovalByIdForPrivyUser,
  listAgentTransactionsForUser,
  updateAgentTransactionById,
} from "./agent-transaction.repository.js";
import type {
  AgentTransactionDetail,
  AgentTransactionListItem,
  AgentTransactionRecord,
  AttachMessageInput,
  ListAgentTransactionsQuery,
  PaginatedAgentTransactions,
  QueryAgentTransactionsInput,
  AgentTransactionsQueryResult,
  RecordAutoExecutedInput,
  RecordPendingApprovalInput,
  TransactionCompletion,
} from "./agent-transaction.types.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
export const AGENT_QUERY_TRANSACTIONS_DEFAULT_LIMIT = 10;
export const AGENT_QUERY_TRANSACTIONS_MAX_LIMIT = 10;
export const PENDING_APPROVAL_TTL_MS = 15 * 60 * 1000;

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}

async function resolveWalletAddress(privyUserId: string, chainId: ChainId): Promise<string> {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, chainId);
  if (!wallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${chainId}"`,
    );
  }
  return wallet.address;
}

function readEvmChainIdFromResult(result: TxResult | null | undefined): number | undefined {
  if (typeof result?.evm_chain_id === "number" && Number.isInteger(result.evm_chain_id)) {
    return result.evm_chain_id;
  }
  const lifi = result?.lifi;
  if (lifi && typeof lifi === "object" && "from_evm_chain_id" in lifi) {
    const fromEvm = (lifi as { from_evm_chain_id?: unknown }).from_evm_chain_id;
    if (typeof fromEvm === "number" && Number.isInteger(fromEvm)) {
      return fromEvm;
    }
  }
  return undefined;
}

function toListItem(row: AgentTransactionRecord): AgentTransactionListItem {
  const chainId = parseChainId(row.chain_id);
  const result = (row.result as TxResult | null) ?? null;
  const evmChainId = readEvmChainIdFromResult(result);
  return {
    id: row.id,
    status: row.status,
    category: row.category,
    chain_id: chainId,
    title: row.title,
    amount_display: row.amount_display,
    digest: row.digest,
    explorer_url: row.digest ? buildExplorerTxUrl(chainId, row.digest, evmChainId) : null,
    effects_status: row.effects_status,
    session_id: row.session_id,
    message_id: row.message_id,
    created_at: row.created_at.toISOString(),
    completed_at: row.completed_at?.toISOString() ?? null,
  };
}

function toDetail(row: AgentTransactionRecord): AgentTransactionDetail {
  const chainId = parseChainId(row.chain_id);
  const result = (row.result as TxResult | null) ?? null;
  const evmChainId = readEvmChainIdFromResult(result);
  return {
    ...toListItem(row),
    action: row.action,
    params: row.params as Record<string, unknown>,
    wallet_address: row.wallet_address,
    workflow_step_index: row.workflow_step_index,
    result: (row.result as TxResult | null) ?? null,
    error_code: row.error_code,
    error_message: row.error_message,
    submitted_at: row.submitted_at?.toISOString() ?? null,
    explorer_url: row.digest ? buildExplorerTxUrl(chainId, row.digest, evmChainId) : null,
  };
}

export function pendingTransactionFromRecord(row: AgentTransactionRecord): PendingTransaction {
  const params = row.params as Record<string, unknown>;
  return {
    id: row.id,
    chain_id: parseChainId(row.chain_id),
    action: row.action,
    params,
    amount_display: row.amount_display,
    summary: row.title,
    quote_expires_at: readDeFiQuoteExpiresAt(params),
  };
}

export function executeInputFromRecord(row: AgentTransactionRecord): ExecuteTransactionInput {
  return {
    chain_id: parseChainId(row.chain_id),
    action: row.action,
    params: row.params as Record<string, unknown>,
  };
}

export async function loadPendingApprovalForUser(
  privyUserId: string,
  transactionId: string,
): Promise<AgentTransactionRecord | null> {
  const row = await findPendingApprovalByIdForPrivyUser(transactionId, privyUserId);
  if (!row) {
    return null;
  }

  const params = row.params as Record<string, unknown>;
  if (isPendingApprovalExpired(params, row.created_at)) {
    await markExpired(transactionId);
    return null;
  }

  return row;
}

/**
 * Diagnose why a pending-approval claim would fail: the row may not exist for
 * this user, may be older than the TTL, or may already have moved out of
 * `pending_approval` (e.g. a prior approve click already submitted/failed it).
 */
export async function describePendingApprovalState(
  privyUserId: string,
  transactionId: string,
): Promise<"claimable" | "missing" | "expired" | `consumed:${string}`> {
  const userId = await requireUserId(privyUserId);
  const row = await findAgentTransactionByIdForUser(transactionId, userId);
  if (!row) {
    return "missing";
  }
  if (row.status !== "pending_approval") {
    return `consumed:${row.status}`;
  }
  const params = row.params as Record<string, unknown>;
  if (isPendingApprovalExpired(params, row.created_at)) {
    return "expired";
  }
  return "claimable";
}

export async function claimPendingApprovalForUser(
  privyUserId: string,
  transactionId: string,
): Promise<AgentTransactionRecord | null> {
  const row = await loadPendingApprovalForUser(privyUserId, transactionId);
  if (!row) {
    return null;
  }

  return claimAgentTransactionStatus(row.id, row.user_id, "pending_approval", {
    status: "submitted",
    submitted_at: new Date(),
  });
}

/**
 * Return a claimed (submitted) approval back to `pending_approval` so the user
 * can retry. Use only when execution failed *before* broadcasting anything on
 * chain (rate limit, balance/quote preflight) — otherwise the approval must be
 * consumed via {@link markCompleted}.
 */
export async function revertPendingApprovalToClaimable(
  transactionId: string,
  userId: bigint,
): Promise<void> {
  await claimAgentTransactionStatus(transactionId, userId, "submitted", {
    status: "pending_approval",
    submitted_at: null,
  });
}

export async function claimPendingRejectionForUser(
  privyUserId: string,
  transactionId: string,
): Promise<AgentTransactionRecord | null> {
  const row = await loadPendingApprovalForUser(privyUserId, transactionId);
  if (!row) {
    return null;
  }

  return claimAgentTransactionStatus(row.id, row.user_id, "pending_approval", {
    status: "rejected",
    completed_at: new Date(),
  });
}

export async function expireStalePendingApprovals(): Promise<number> {
  const nowMs = Date.now();
  const standardCutoff = new Date(nowMs - PENDING_APPROVAL_TTL_MS);

  const standardExpired = await expirePendingApprovalsOlderThan(standardCutoff, {
    excludeLifiContinuation: true,
  });

  const continuationExpired = await expireLifiContinuationPendingApprovals(nowMs);
  return standardExpired + continuationExpired;
}

async function expireLifiContinuationPendingApprovals(nowMs: number): Promise<number> {
  const { prisma } = await import("../../infrastructure/postgres/client.js");
  const rows = await prisma.agentTransaction.findMany({
    where: {
      status: "pending_approval",
      OR: [
        { params: { path: ["lifi_continuation"], equals: true } },
        { params: { path: ["approval_kind"], equals: "lifi_continue" } },
        { params: { path: ["approval_kind"], equals: "lifi_continuation" } },
      ],
    },
    select: { id: true, params: true, created_at: true },
  });

  let expired = 0;
  for (const row of rows) {
    const params = row.params as Record<string, unknown>;
    if (isPendingApprovalExpired(params, row.created_at, nowMs)) {
      await markExpired(row.id);
      expired += 1;
    }
  }
  return expired;
}

export async function clearPendingApprovalsForTests(): Promise<void> {
  await deletePendingApprovalsForTests();
}

function trimTxResult(result: TxResult): Record<string, unknown> {
  return result as Record<string, unknown>;
}

function normalizePagination(query: ListAgentTransactionsQuery): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(DEFAULT_PAGE, query.page ?? DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

export async function recordPendingApproval(
  input: RecordPendingApprovalInput,
): Promise<AgentTransactionListItem> {
  const userId = await requireUserId(input.privyUserId);
  const walletAddress = await resolveWalletAddress(input.privyUserId, input.input.chain_id);
  const display = await buildTransactionDisplay(input.privyUserId, input.input);

  const row = await createAgentTransaction({
    id: input.pending.id,
    user_id: userId,
    session_id: input.sessionId ?? null,
    message_id: input.messageId ?? null,
    workflow_step_index: input.workflowStepIndex ?? null,
    chain_id: input.input.chain_id,
    wallet_address: walletAddress,
    action: input.input.action,
    params: input.input.params,
    category: categorizeAgentTransactionAction(input.input.action),
    title: display.title,
    amount_display: input.pending.amount_display || display.amount_display,
    status: "pending_approval",
  });

  return toListItem(row);
}

export async function recordAutoExecuted(
  input: RecordAutoExecutedInput,
): Promise<AgentTransactionListItem> {
  const userId = await requireUserId(input.privyUserId);
  const walletAddress = await resolveWalletAddress(input.privyUserId, input.input.chain_id);
  const display = await buildTransactionDisplay(input.privyUserId, input.input);

  const row = await createAgentTransaction({
    ...(input.transactionId ? { id: input.transactionId } : {}),
    user_id: userId,
    session_id: input.sessionId ?? null,
    message_id: input.messageId ?? null,
    workflow_step_index: input.workflowStepIndex ?? null,
    chain_id: input.input.chain_id,
    wallet_address: walletAddress,
    action: input.input.action,
    params: input.input.params,
    category: categorizeAgentTransactionAction(input.input.action),
    title: display.title,
    amount_display: display.amount_display,
    status: "submitted",
    submitted_at: new Date(),
  });

  return toListItem(row);
}

export async function markApprovedSubmitted(transactionId: string): Promise<void> {
  await updateAgentTransactionById(transactionId, {
    status: "submitted",
    submitted_at: new Date(),
  });
}

export async function markLifiSubmitted(
  transactionId: string,
  input: {
    digest: string | null;
    effects_status: string;
    result: TxResult;
  },
): Promise<AgentTransactionListItem | null> {
  const row = await updateAgentTransactionById(transactionId, {
    status: "submitted",
    digest: input.digest,
    effects_status: input.effects_status,
    result: trimTxResult(input.result),
    error_code: null,
    error_message: null,
    submitted_at: new Date(),
  });
  return row ? toListItem(row) : null;
}

export async function updateLifiTrackingProgress(
  transactionId: string,
  input: {
    digest?: string | null;
    effects_status: string;
    result: TxResult;
  },
): Promise<AgentTransactionListItem | null> {
  const row = await updateAgentTransactionById(transactionId, {
    status: "submitted",
    ...(input.digest !== undefined ? { digest: input.digest } : {}),
    effects_status: input.effects_status,
    result: trimTxResult(input.result),
  });
  return row ? toListItem(row) : null;
}

export async function markLifiTerminal(
  transactionId: string,
  input: {
    status: "success" | "failure";
    digest: string | null;
    effects_status: string;
    result: TxResult;
    error?: { code: string; message: string };
  },
): Promise<AgentTransactionListItem | null> {
  const now = new Date();
  const row = await updateAgentTransactionById(transactionId, {
    status: input.status,
    digest: input.digest,
    effects_status: input.effects_status,
    result: trimTxResult(input.result),
    error_code: input.error?.code ?? null,
    error_message: input.error?.message
      ? sanitizeErrorMessageForUi(input.error.message)
      : null,
    completed_at: now,
  });
  return row ? toListItem(row) : null;
}

export async function markCompleted(
  transactionId: string,
  completion: TransactionCompletion,
): Promise<AgentTransactionListItem | null> {
  const now = new Date();
  const existing = await findAgentTransactionById(transactionId);

  if (completion.kind === "success") {
    const amountDisplay = existing
      ? enrichDisplayFromResult(existing.amount_display, completion.result)
      : enrichDisplayFromResult("", completion.result);

    const terminalStatus =
      completion.result.effects_status === "pending" ? "submitted" : "success";

    const row = await updateAgentTransactionById(transactionId, {
      status: terminalStatus,
      digest: completion.result.digest,
      effects_status: completion.result.effects_status,
      result: trimTxResult(completion.result),
      error_code: null,
      error_message: null,
      ...(terminalStatus === "success" ? { completed_at: now } : {}),
      ...(amountDisplay ? { amount_display: amountDisplay } : {}),
    });
    return row ? toListItem(row) : null;
  }

  const row = await updateAgentTransactionById(transactionId, {
    status: "failure",
    error_code: completion.error.code,
    error_message: sanitizeErrorMessageForUi(completion.error.message),
    completed_at: now,
  });
  return row ? toListItem(row) : null;
}

export async function markRejected(transactionId: string): Promise<void> {
  await updateAgentTransactionById(transactionId, {
    status: "rejected",
    completed_at: new Date(),
  });
}

export async function markExpired(transactionId: string): Promise<void> {
  await updateAgentTransactionById(transactionId, {
    status: "expired",
    completed_at: new Date(),
  });
}

export async function attachMessageId(input: AttachMessageInput): Promise<void> {
  await updateAgentTransactionById(input.transactionId, {
    message: { connect: { id: input.messageId } },
  });
}

export async function listTransactions(
  privyUserId: string,
  query: ListAgentTransactionsQuery = {},
): Promise<PaginatedAgentTransactions> {
  const userId = await requireUserId(privyUserId);
  const { page, limit, skip } = normalizePagination(query);

  const { items, total } = await listAgentTransactionsForUser({
    user_id: userId,
    status: query.status,
    category: query.category,
    chain_id: query.chain_id,
    session_id: query.session_id,
    skip,
    take: limit,
  });

  return {
    items: items.map(toListItem),
    page,
    limit,
    total,
  };
}

export async function queryAgentTransactions(
  privyUserId: string,
  input: QueryAgentTransactionsInput = {},
): Promise<AgentTransactionsQueryResult> {
  if (input.transactionId) {
    const detail = await getTransaction(privyUserId, input.transactionId);
    return {
      items: [detail],
      total: 1,
      limit: 1,
      summary: formatAgentTransactionsForChat([detail]),
    };
  }

  const limit = Math.min(
    AGENT_QUERY_TRANSACTIONS_MAX_LIMIT,
    Math.max(1, input.limit ?? AGENT_QUERY_TRANSACTIONS_DEFAULT_LIMIT),
  );

  const result = await listTransactions(privyUserId, {
    page: 1,
    limit,
    status: input.status,
    category: input.category,
    chain_id: input.chainId,
    session_id: input.sessionId,
  });

  return {
    items: result.items,
    total: result.total,
    limit: result.limit,
    summary: formatAgentTransactionsForChat(result.items),
  };
}

export async function getTransaction(
  privyUserId: string,
  transactionId: string,
): Promise<AgentTransactionDetail> {
  const userId = await requireUserId(privyUserId);
  const row = await findAgentTransactionByIdForUser(transactionId, userId);

  if (!row) {
    throw new AppError(404, "TRANSACTION_NOT_FOUND", "Agent transaction not found.");
  }

  return toDetail(row);
}

export async function listSessionTransactions(
  privyUserId: string,
  sessionId: string,
): Promise<AgentTransactionListItem[]> {
  const userId = await requireUserId(privyUserId);
  const session = await findSessionForUser(sessionId, userId);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found.");
  }

  const rows = await findAgentTransactionsBySessionForUser(sessionId, userId);
  return rows.map(toListItem);
}
