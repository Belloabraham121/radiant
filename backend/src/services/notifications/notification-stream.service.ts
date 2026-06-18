import { Redis } from "ioredis";
import { getRedisClient } from "../../infrastructure/redis/client.js";
import type { NotificationStreamEvent } from "./notification-stream.types.js";

const NOTIFICATION_STREAM_CHANNEL_PREFIX = "radiant:notification-stream:";
const STREAM_EVENT_DEDUPE_MS = 3_000;

type StreamListener = (event: NotificationStreamEvent) => void;

const localListeners = new Map<string, Set<StreamListener>>();
const recentStreamEvents = new Map<string, number>();

function streamEventDedupeKey(userId: bigint, event: NotificationStreamEvent): string {
  const eventId =
    "event_id" in event && typeof event.event_id === "string" ? event.event_id : null;
  return `${userId.toString()}:${eventId ?? `${event.type}:${event.ts ?? ""}`}`;
}

function shouldDeliverStreamEvent(userId: bigint, event: NotificationStreamEvent): boolean {
  const key = streamEventDedupeKey(userId, event);
  const now = Date.now();
  const last = recentStreamEvents.get(key);
  if (last != null && now - last < STREAM_EVENT_DEDUPE_MS) {
    return false;
  }
  recentStreamEvents.set(key, now);
  return true;
}

let redisSubscriber: Redis | null = null;
let redisSubscriberInit: Promise<Redis | null> | null = null;
const redisSubscribedUsers = new Set<string>();

function channelForUser(userId: bigint): string {
  return `${NOTIFICATION_STREAM_CHANNEL_PREFIX}${userId.toString()}`;
}

function notifyLocalListeners(userId: bigint, event: NotificationStreamEvent): void {
  if (!shouldDeliverStreamEvent(userId, event)) {
    return;
  }

  const listeners = localListeners.get(userId.toString());
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Best-effort broadcast.
    }
  }
}

function handleRedisMessage(channel: string, message: string): void {
  if (!channel.startsWith(NOTIFICATION_STREAM_CHANNEL_PREFIX)) {
    return;
  }

  const userId = channel.slice(NOTIFICATION_STREAM_CHANNEL_PREFIX.length);
  try {
    const event = JSON.parse(message) as NotificationStreamEvent;
    notifyLocalListeners(BigInt(userId), event);
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

async function ensureRedisSubscription(userId: bigint): Promise<void> {
  const key = userId.toString();
  if (redisSubscribedUsers.has(key)) {
    return;
  }

  const subscriber = await ensureRedisSubscriber();
  if (!subscriber) {
    return;
  }

  try {
    await subscriber.subscribe(channelForUser(userId));
    redisSubscribedUsers.add(key);
  } catch {
    // SSE still works for events emitted on this process via in-memory fallback.
  }
}

async function removeRedisSubscription(userId: bigint): Promise<void> {
  const key = userId.toString();
  if (localListeners.has(key)) {
    return;
  }

  const subscriber = redisSubscriber;
  if (!subscriber || !redisSubscribedUsers.has(key)) {
    return;
  }

  try {
    await subscriber.unsubscribe(channelForUser(userId));
  } catch {
    // Ignore unsubscribe failures during disconnect.
  } finally {
    redisSubscribedUsers.delete(key);
  }
}

export function subscribeNotificationStream(
  userId: bigint,
  listener: StreamListener,
): () => void {
  const key = userId.toString();
  let listeners = localListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    localListeners.set(key, listeners);
  }

  listeners.add(listener);
  void ensureRedisSubscription(userId);

  return () => {
    const set = localListeners.get(key);
    if (!set) {
      return;
    }

    set.delete(listener);
    if (set.size === 0) {
      localListeners.delete(key);
      void removeRedisSubscription(userId);
    }
  };
}

export function emitNotificationStreamEvent(
  userId: bigint,
  event: NotificationStreamEvent,
): void {
  notifyLocalListeners(userId, event);

  const redis = getRedisClient();
  if (redis) {
    void redis.publish(channelForUser(userId), JSON.stringify(event)).catch(() => {
      // Local listeners already notified above.
    });
    return;
  }
}

export async function resetNotificationStreamForTests(): Promise<void> {
  localListeners.clear();
  recentStreamEvents.clear();
  redisSubscribedUsers.clear();
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
