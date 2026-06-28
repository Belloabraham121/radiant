import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import type {
  CreateSessionInput,
  MessageRecord,
  SessionDetail,
  SessionListItem,
} from "./conversation.types.js";
import { listMessagesBySessionId } from "./message.repository.js";
import { drainPendingExecuteInApp } from "../agent/agent-stream-pending-execute.js";
import {
  findSessionIdsWithActiveTransactionsForUser,
  sessionHasActiveTransaction,
} from "../agent-transaction/agent-transaction.repository.js";
import {
  createSession,
  deleteSessionById,
  findSessionForUser,
  listSessionsByUserId,
} from "./session.repository.js";


const PREVIEW_MAX_LENGTH = 80;
const SESSION_TITLE_MAX_LENGTH = 60;

function truncatePreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PREVIEW_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, PREVIEW_MAX_LENGTH - 1)}…`;
}

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}

async function requireOwnedSession(sessionId: string, userId: bigint) {
  const session = await findSessionForUser(sessionId, userId);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found.");
  }
  return session;
}

function toSessionListItem(
  session: Awaited<ReturnType<typeof listSessionsByUserId>>[number],
  activeSessionIds: Set<string>,
): SessionListItem {
  const latest = session.messages[0]?.content ?? null;
  return {
    id: session.id,
    title: session.title,
    updated_at: session.updated_at.toISOString(),
    preview: latest ? truncatePreview(latest) : null,
    has_active_transaction: activeSessionIds.has(session.id),
  };
}

function toMessageRecord(message: Awaited<ReturnType<typeof listMessagesBySessionId>>[number]): MessageRecord {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    tool_calls: message.tool_calls,
    created_at: message.created_at.toISOString(),
  };
}

export async function listUserSessions(privyUserId: string): Promise<{ sessions: SessionListItem[] }> {
  const userId = await requireUserId(privyUserId);
  const [sessions, activeSessionIds] = await Promise.all([
    listSessionsByUserId(userId),
    findSessionIdsWithActiveTransactionsForUser(userId),
  ]);
  return {
    sessions: sessions.map((session) => toSessionListItem(session, activeSessionIds)),
  };
}

export async function createUserSession(
  privyUserId: string,
  input: CreateSessionInput = {},
): Promise<SessionDetail & { created_at: string }> {
  const userId = await requireUserId(privyUserId);
  const session = await createSession(userId, input.title ?? "New chat");

  return {
    id: session.id,
    title: session.title,
    created_at: session.created_at.toISOString(),
    updated_at: session.updated_at.toISOString(),
  };
}

export function deriveSessionTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  if (trimmed.length <= SESSION_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, SESSION_TITLE_MAX_LENGTH - 1)}…`;
}

export async function resolveOrCreateSession(
  privyUserId: string,
  sessionId?: string,
): Promise<{ session: Awaited<ReturnType<typeof requireOwnedSession>>; userId: bigint }> {
  const userId = await requireUserId(privyUserId);
  if (sessionId) {
    const session = await requireOwnedSession(sessionId, userId);
    return { session, userId };
  }

  const session = await createSession(userId);
  return { session, userId };
}

export async function getSessionMessages(
  privyUserId: string,
  sessionId: string,
): Promise<{ session: SessionDetail; messages: MessageRecord[] }> {
  const userId = await requireUserId(privyUserId);
  const session = await requireOwnedSession(sessionId, userId);
  const messages = await listMessagesBySessionId(session.id);

  return {
    session: {
      id: session.id,
      title: session.title,
      updated_at: session.updated_at.toISOString(),
    },
    messages: messages.map(toMessageRecord),
  };
}

export async function deleteUserSession(
  privyUserId: string,
  sessionId: string,
): Promise<{ id: string; deleted: true }> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedSession(sessionId, userId);

  if (await sessionHasActiveTransaction(sessionId)) {
    throw new AppError(
      409,
      "TRANSACTION_IN_PROGRESS",
      "Cannot delete chat while a transaction is in progress.",
    );
  }

  drainPendingExecuteInApp(sessionId);
  await deleteSessionById(sessionId);

  return { id: sessionId, deleted: true };
}
