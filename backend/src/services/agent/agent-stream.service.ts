import { Redis } from "ioredis";
import { AppError } from "../../errors/app-error.js";
import { getRedisClient } from "../../infrastructure/redis/client.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import type {
  AgentStreamEvent,
  AgentStreamEventInput,
  AgentStreamEventType,
} from "./agent-stream.types.js";

const AGENT_STREAM_CHANNEL_PREFIX = "radiant:agent-stream:";

type StreamListener = (event: AgentStreamEvent) => void;

/** In-process SSE listeners keyed by chat session id (dev / single-node). */
const localListeners = new Map<string, Set<StreamListener>>();

let redisSubscriber: Redis | null = null;
let redisSubscriberInit: Promise<Redis | null> | null = null;
const redisSubscribedSessions = new Set<string>();

function channelForSession(sessionId: string): string {
  return `${AGENT_STREAM_CHANNEL_PREFIX}${sessionId}`;
}

function notifyLocalListeners(sessionId: string, event: AgentStreamEvent): void {
  const listeners = localListeners.get(sessionId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Best-effort broadcast — never fail execute paths.
    }
  }
}

function handleRedisMessage(channel: string, message: string): void {
  if (!channel.startsWith(AGENT_STREAM_CHANNEL_PREFIX)) {
    return;
  }

  const sessionId = channel.slice(AGENT_STREAM_CHANNEL_PREFIX.length);
  try {
    const event = JSON.parse(message) as AgentStreamEvent;
    notifyLocalListeners(sessionId, event);
  } catch {
    // Ignore malformed payloads.
  }
}

async function ensureRedisSubscriber(): Promise<Redis | null> {
  if (redisSubscriber) {
    return redisSubscriber;
  }

  if (redisSubscriberInit) {
    return redisSubscriberInit;
  }

  redisSubscriberInit = (async () => {
    const publisher = getRedisClient();
    if (!publisher) {
      return null;
    }

    const subscriber = publisher.duplicate();
    subscriber.on("message", handleRedisMessage);
    subscriber.on("error", () => {
      // Degrade to in-memory when Redis is unavailable.
    });

    try {
      await subscriber.connect();
    } catch {
      return null;
    }

    redisSubscriber = subscriber;
    return subscriber;
  })();

  return redisSubscriberInit;
}

async function ensureRedisSubscription(sessionId: string): Promise<void> {
  if (redisSubscribedSessions.has(sessionId)) {
    return;
  }

  const subscriber = await ensureRedisSubscriber();
  if (!subscriber) {
    return;
  }

  try {
    await subscriber.subscribe(channelForSession(sessionId));
    redisSubscribedSessions.add(sessionId);
  } catch {
    // SSE still works for events emitted on this process via in-memory fallback.
  }
}

async function removeRedisSubscription(sessionId: string): Promise<void> {
  if (localListeners.has(sessionId)) {
    return;
  }

  const subscriber = redisSubscriber;
  if (!subscriber || !redisSubscribedSessions.has(sessionId)) {
    return;
  }

  try {
    await subscriber.unsubscribe(channelForSession(sessionId));
  } catch {
    // Ignore unsubscribe failures during disconnect.
  } finally {
    redisSubscribedSessions.delete(sessionId);
  }
}

/** Verify the authenticated user owns the chat session before opening SSE. */
export async function requireAgentStreamSession(
  privyUserId: string,
  sessionId: string,
): Promise<void> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }

  const session = await findSessionForUser(sessionId, user.id);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found.");
  }
}

/** Subscribe to live agent events for a chat session. Returns an unsubscribe function. */
export function subscribeAgentStream(
  sessionId: string,
  listener: StreamListener,
): () => void {
  let listeners = localListeners.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    localListeners.set(sessionId, listeners);
  }

  listeners.add(listener);
  void ensureRedisSubscription(sessionId);

  return () => {
    const set = localListeners.get(sessionId);
    if (!set) {
      return;
    }

    set.delete(listener);
    if (set.size === 0) {
      localListeners.delete(sessionId);
      void removeRedisSubscription(sessionId);
    }
  };
}

/** Whether any SSE client is listening for this session (in-process). */
export function hasAgentStreamSubscribers(sessionId: string): boolean {
  return (localListeners.get(sessionId)?.size ?? 0) > 0;
}

/**
 * Broadcast a live agent event to SSE subscribers.
 * Best-effort: never throws; skips silently when no listeners or Redis is down.
 */
export function emitAgentEvent(
  sessionId: string,
  type: AgentStreamEventType,
  payload: AgentStreamEventInput = {},
): void {
  const event: AgentStreamEvent = {
    type,
    session_id: sessionId,
    ts: new Date().toISOString(),
    ...payload,
  };

  const redis = getRedisClient();
  if (redis) {
    void redis
      .publish(channelForSession(sessionId), JSON.stringify(event))
      .catch(() => {
        notifyLocalListeners(sessionId, event);
      });
    return;
  }

  notifyLocalListeners(sessionId, event);
}

/** Test hook — clear in-memory listeners and Redis subscription tracking. */
export async function resetAgentStreamForTests(): Promise<void> {
  localListeners.clear();
  redisSubscribedSessions.clear();
  redisSubscriberInit = null;

  if (redisSubscriber) {
    try {
      await redisSubscriber.quit();
    } catch {
      // Ignore teardown errors in tests.
    }
    redisSubscriber = null;
  }
}
