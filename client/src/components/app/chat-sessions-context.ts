"use client";

import { createContext, useContext } from "react";
import type { ChatSessionListItem } from "@/lib/chat-api";

export type ChatSessionsContextValue = {
  sessions: ChatSessionListItem[];
  loading: boolean;
  error: string | null;
  refreshSessions: () => Promise<void>;
  createSession: () => Promise<string>;
};

export const ChatSessionsContext = createContext<ChatSessionsContextValue | null>(null);

export function useChatSessions(): ChatSessionsContextValue {
  const context = useContext(ChatSessionsContext);
  if (!context) {
    throw new Error("useChatSessions must be used within ChatSessionsProvider");
  }
  return context;
}
