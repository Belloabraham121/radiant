import type { ChatMessage } from "@/lib/chat-messages";

export type CachedChatSession = {
  messages: ChatMessage[];
  title: string;
};

/** In-memory handoff so URL navigation after first send does not refetch and flash. */
const sessionCache = new Map<string, CachedChatSession>();

export function cacheChatSession(sessionId: string, data: CachedChatSession): void {
  sessionCache.set(sessionId, data);
}

/** Returns cached state once, then removes it. */
export function takeCachedChatSession(sessionId: string): CachedChatSession | null {
  const cached = sessionCache.get(sessionId);
  if (!cached) return null;
  sessionCache.delete(sessionId);
  return cached;
}
