"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { fetchChatSessions, type ChatSessionListItem } from "@/lib/chat-api";
import { ChatSessionsContext, type RefreshSessionsOptions } from "./chat-sessions-context";

export function ChatSessionsProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async (options?: RefreshSessionsOptions) => {
    if (!ready || !authenticated) {
      setSessions([]);
      setError(null);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const data = await fetchChatSessions();
      setSessions(data.sessions);
      setError(null);
    } catch {
      setSessions([]);
      setError("Could not load your chats.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [authenticated, ready]);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      if (!ready || !authenticated) {
        if (!cancelled) {
          setSessions([]);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const data = await fetchChatSessions();
        if (!cancelled) {
          setSessions(data.sessions);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setSessions([]);
          setError("Could not load your chats.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [authenticated, ready]);

  const value = useMemo(
    () => ({
      sessions,
      loading,
      error,
      refreshSessions,
    }),
    [sessions, loading, error, refreshSessions],
  );

  return (
    <ChatSessionsContext.Provider value={value}>{children}</ChatSessionsContext.Provider>
  );
}
