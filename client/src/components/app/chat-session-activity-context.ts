"use client";

import { createContext, useContext } from "react";

export type ChatSessionActivityContextValue = {
  /** Client-side busy state for sessions with an open chat view. */
  isSessionBusy: (sessionId: string) => boolean;
  setSessionBusy: (sessionId: string, busy: boolean) => void;
};

export const ChatSessionActivityContext = createContext<ChatSessionActivityContextValue | null>(
  null,
);

export function useChatSessionActivity(): ChatSessionActivityContextValue {
  const context = useContext(ChatSessionActivityContext);
  if (!context) {
    throw new Error("useChatSessionActivity must be used within ChatSessionActivityProvider");
  }
  return context;
}
