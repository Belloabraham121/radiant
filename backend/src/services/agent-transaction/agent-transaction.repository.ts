import { prisma } from "../../infrastructure/postgres/client.js";
import type { Prisma } from "@prisma/client";
import type { ChainId } from "../chains/types.js";
import type {
  AgentTransactionCategory,
  AgentTransactionRecord,
  AgentTransactionStatus,
} from "./agent-transaction.types.js";

export type CreateAgentTransactionData = {
  id?: string;
  user_id: bigint;
  session_id?: string | null;
  message_id?: string | null;
  workflow_step_index?: number | null;
  chain_id: ChainId;
  wallet_address: string;
  action: string;
  params: Record<string, unknown>;
  category: AgentTransactionCategory;
  title: string;
  amount_display: string;
  status: AgentTransactionStatus;
  digest?: string | null;
  effects_status?: string | null;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  submitted_at?: Date | null;
  completed_at?: Date | null;
};

export type UpdateAgentTransactionData = {
  status?: AgentTransactionStatus;
  amount_display?: string;
  digest?: string | null;
  effects_status?: string | null;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  submitted_at?: Date | null;
  completed_at?: Date | null;
  message?: { connect: { id: string } };
};

export type ListAgentTransactionFilters = {
  user_id: bigint;
  status?: AgentTransactionStatus;
  category?: AgentTransactionCategory;
  chain_id?: ChainId;
  session_id?: string;
  skip: number;
  take: number;
};

function toRecord(row: {
  id: string;
  user_id: bigint;
  session_id: string | null;
  message_id: string | null;
  workflow_step_index: number | null;
  chain_id: string;
  wallet_address: string;
  action: string;
  params: unknown;
  category: string;
  title: string;
  amount_display: string;
  status: string;
  digest: string | null;
  effects_status: string | null;
  result: unknown;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  submitted_at: Date | null;
  completed_at: Date | null;
}): AgentTransactionRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    session_id: row.session_id,
    message_id: row.message_id,
    workflow_step_index: row.workflow_step_index,
    chain_id: row.chain_id,
    wallet_address: row.wallet_address,
    action: row.action,
    params: row.params,
    category: row.category as AgentTransactionCategory,
    title: row.title,
    amount_display: row.amount_display,
    status: row.status as AgentTransactionStatus,
    digest: row.digest,
    effects_status: row.effects_status,
    result: row.result,
    error_code: row.error_code,
    error_message: row.error_message,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
  };
}

export async function createAgentTransaction(
  data: CreateAgentTransactionData,
): Promise<AgentTransactionRecord> {
  const row = await prisma.agentTransaction.create({
    data: {
      ...(data.id ? { id: data.id } : {}),
      user_id: data.user_id,
      session_id: data.session_id ?? null,
      message_id: data.message_id ?? null,
      workflow_step_index: data.workflow_step_index ?? null,
      chain_id: data.chain_id,
      wallet_address: data.wallet_address,
      action: data.action,
      params: data.params as Prisma.InputJsonValue,
      category: data.category,
      title: data.title,
      amount_display: data.amount_display,
      status: data.status,
      digest: data.digest ?? null,
      effects_status: data.effects_status ?? null,
      result: data.result ? (data.result as Prisma.InputJsonValue) : undefined,
      error_code: data.error_code ?? null,
      error_message: data.error_message ?? null,
      submitted_at: data.submitted_at ?? null,
      completed_at: data.completed_at ?? null,
    },
  });

  return toRecord(row);
}

export async function updateAgentTransactionById(
  id: string,
  data: UpdateAgentTransactionData,
): Promise<AgentTransactionRecord | null> {
  try {
    const row = await prisma.agentTransaction.update({
      where: { id },
      data: data as Prisma.AgentTransactionUpdateInput,
    });
    return toRecord(row);
  } catch {
    return null;
  }
}

export async function findAgentTransactionById(
  id: string,
): Promise<AgentTransactionRecord | null> {
  const row = await prisma.agentTransaction.findUnique({
    where: { id },
  });
  return row ? toRecord(row) : null;
}

export async function findAgentTransactionByIdForUser(
  id: string,
  userId: bigint,
): Promise<AgentTransactionRecord | null> {
  const row = await prisma.agentTransaction.findFirst({
    where: { id, user_id: userId },
  });
  return row ? toRecord(row) : null;
}

export async function listAgentTransactionsForUser(
  filters: ListAgentTransactionFilters,
): Promise<{ items: AgentTransactionRecord[]; total: number }> {
  const where = {
    user_id: filters.user_id,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.chain_id ? { chain_id: filters.chain_id } : {}),
    ...(filters.session_id ? { session_id: filters.session_id } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.agentTransaction.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.agentTransaction.count({ where }),
  ]);

  return { items: items.map(toRecord), total };
}

export async function findAgentTransactionsBySessionForUser(
  sessionId: string,
  userId: bigint,
): Promise<AgentTransactionRecord[]> {
  const rows = await prisma.agentTransaction.findMany({
    where: { session_id: sessionId, user_id: userId },
    orderBy: { created_at: "asc" },
  });
  return rows.map(toRecord);
}

export async function findPendingApprovalSessionIdByFallbackOfferId(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<string | null> {
  const row = await prisma.agentTransaction.findFirst({
    where: {
      status: "pending_approval",
      user: { privy_user_id: privyUserId },
      params: {
        path: ["liquidity_fallback_offer", "fallback_offer_id"],
        equals: fallbackOfferId,
      },
    },
    select: { session_id: true },
    orderBy: { created_at: "desc" },
  });
  return row?.session_id ?? null;
}

export async function findPendingApprovalByIdForPrivyUser(
  id: string,
  privyUserId: string,
): Promise<AgentTransactionRecord | null> {
  const row = await prisma.agentTransaction.findFirst({
    where: {
      id,
      status: "pending_approval",
      user: { privy_user_id: privyUserId },
    },
  });
  return row ? toRecord(row) : null;
}

export async function claimAgentTransactionStatus(
  id: string,
  userId: bigint,
  expectedStatus: AgentTransactionStatus,
  data: UpdateAgentTransactionData,
): Promise<AgentTransactionRecord | null> {
  const result = await prisma.agentTransaction.updateMany({
    where: { id, user_id: userId, status: expectedStatus },
    data: data as Prisma.AgentTransactionUpdateInput,
  });

  if (result.count === 0) {
    return null;
  }

  return findAgentTransactionById(id);
}

export async function expirePendingApprovalsOlderThan(
  cutoff: Date,
  options?: { excludeLifiContinuation?: boolean },
): Promise<number> {
  const excludeContinuation = options?.excludeLifiContinuation ?? false;
  const result = await prisma.agentTransaction.updateMany({
    where: {
      status: "pending_approval",
      created_at: { lt: cutoff },
      ...(excludeContinuation
        ? {
            NOT: {
              OR: [
                { params: { path: ["lifi_continuation"], equals: true } },
                { params: { path: ["approval_kind"], equals: "lifi_continue" } },
                { params: { path: ["approval_kind"], equals: "lifi_continuation" } },
              ],
            },
          }
        : {}),
    },
    data: {
      status: "expired",
      completed_at: new Date(),
    },
  });
  return result.count;
}

export async function deletePendingApprovalsForTests(): Promise<void> {
  await prisma.agentTransaction.deleteMany({
    where: { status: "pending_approval" },
  });
}
