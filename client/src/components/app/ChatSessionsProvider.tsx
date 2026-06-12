"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  createChatSession,
  fetchChatSessions,
  type ChatSessionListItem,
} from "@/lib/chat-api";
import { ChatSessionsContext } from "./chat-sessions-context";

export function ChatSessionsProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    if (!ready || !authenticated) {
      setSessions([]);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchChatSessions();
      setSessions(data.sessions);
      setError(null);
    } catch {
      setSessions([]);
      setError("Could not load your chats.");
    } finally {
      setLoading(false);
    }
  }, [authenticated, ready]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const createSession = useCallback(async () => {
    const session = await createChatSession();
    await refreshSessions();
    return session.id;
  }, [refreshSessions]);

  const value = useMemo(
    () => ({
      sessions,
      loading,
      error,
      refreshSessions,
      createSession,
    }),
    [sessions, loading, error, refreshSessions, createSession],
  );

  return (
    <ChatSessionsContext.Provider value={value}>{children}</ChatSessionsContext.Provider>
  );
}
