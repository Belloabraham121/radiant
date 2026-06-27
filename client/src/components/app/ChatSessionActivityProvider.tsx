"use client";

import { useCallback, useMemo, useState } from "react";
import { ChatSessionActivityContext } from "./chat-session-activity-context";

export function ChatSessionActivityProvider({ children }: { children: React.ReactNode }) {
  const [busySessionIds, setBusySessionIds] = useState<Set<string>>(() => new Set());

  const setSessionBusy = useCallback((sessionId: string, busy: boolean) => {
    setBusySessionIds((current) => {
      const hasSession = current.has(sessionId);
      if (busy && hasSession) {
        return current;
      }
      if (!busy && !hasSession) {
        return current;
      }

      const next = new Set(current);
      if (busy) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  }, []);

  const isSessionBusy = useCallback(
    (sessionId: string) => busySessionIds.has(sessionId),
    [busySessionIds],
  );

  const value = useMemo(
    () => ({
      isSessionBusy,
      setSessionBusy,
    }),
    [isSessionBusy, setSessionBusy],
  );

  return (
    <ChatSessionActivityContext.Provider value={value}>
      {children}
    </ChatSessionActivityContext.Provider>
  );
}
