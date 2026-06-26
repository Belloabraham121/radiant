"use client";

import { createContext, useContext } from "react";
import type { ChatSessionListItem } from "@/lib/chat-api";

export type RefreshSessionsOptions = {
  /** When true, refresh the list without toggling global loading state. */
  silent?: boolean;
};

export type ChatSessionsContextValue = {
  sessions: ChatSessionListItem[];
  loading: boolean;
  error: string | null;
  refreshSessions: (options?: RefreshSessionsOptions) => Promise<void>;
  /** Increments when the user starts a fresh draft chat (no DB session until first message). */
  draftResetKey: number;
  startNewChat: () => void;
};

export const ChatSessionsContext = createContext<ChatSessionsContextValue | null>(null);

export function useChatSessions(): ChatSessionsContextValue {
  const context = useContext(ChatSessionsContext);
  if (!context) {
    throw new Error("useChatSessions must be used within ChatSessionsProvider");
  }
  return context;
}
