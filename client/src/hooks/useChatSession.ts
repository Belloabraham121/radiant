"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  fetchSessionMessages,
  postChat,
  type PendingTransaction,
} from "@/lib/chat-api";
import {
  apiMessagesToChatMessages,
  mapToolCallsToReceipts,
  type ChatMessage,
} from "@/lib/chat-messages";
import { cacheChatSession, takeCachedChatSession } from "@/lib/chat-session-cache";
import { useChatSessions } from "@/components/app/chat-sessions-context";

function initialChatSessionState(sessionId?: string) {
  if (!sessionId) {
    return {
      messages: [] as ChatMessage[],
      title: "New chat",
      loading: false,
      skipFetch: true,
      pending_transaction: null as PendingTransaction | null,
    };
  }

  const cached = takeCachedChatSession(sessionId);
  if (cached) {
    return {
      messages: cached.messages,
      title: cached.title,
      loading: false,
      skipFetch: true,
      pending_transaction: cached.pending_transaction ?? null,
    };
  }

  return {
    messages: [] as ChatMessage[],
    title: "New chat",
    loading: true,
    skipFetch: false,
    pending_transaction: null as PendingTransaction | null,
  };
}

export function useChatSession(sessionId?: string) {
  const router = useRouter();
  const { refreshSessions } = useChatSessions();
  const [boot] = useState(() => initialChatSessionState(sessionId));

  const [messages, setMessages] = useState<ChatMessage[]>(boot.messages);
  const [title, setTitle] = useState(boot.title);
  const [activeSessionId, setActiveSessionId] = useState(sessionId);
  const [loading, setLoading] = useState(boot.loading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<PendingTransaction | null>(
    boot.pending_transaction,
  );
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!sessionId || boot.skipFetch) {
      return;
    }

    const id = sessionId;

    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchSessionMessages(id);
        if (cancelled) return;
        setTitle(data.session.title);
        setMessages(apiMessagesToChatMessages(data.messages));
      } catch (err) {
        if (cancelled) return;
        setMessages([]);
        setLoadError(
          err instanceof ApiError ? err.message : "Could not load this conversation.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [boot.skipFetch, sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || typing) return;

      const optimisticId = `u-${Date.now()}`;
      setMessages((current) => [
        ...current,
        { id: optimisticId, role: "user", text },
      ]);
      setTyping(true);
      setChatError(null);

      try {
        const data = await postChat({
          message: text,
          session_id: activeSessionId,
        });

        const nextTitle =
          title === "New chat" ? text.slice(0, 60) : title;

        setActiveSessionId(data.session_id);
        setTitle(nextTitle);
        setMessages((current) => {
          const nextMessages: ChatMessage[] = [
            ...current.filter((message) => message.id !== optimisticId),
            { id: optimisticId, role: "user", text },
            {
              id: data.message_id,
              role: "agent",
              text: data.reply,
              receipts: mapToolCallsToReceipts(data.tool_calls),
            },
          ];

          if (!sessionId && data.session_id) {
            cacheChatSession(data.session_id, {
              messages: nextMessages,
              title: nextTitle,
              pending_transaction: data.pending_transaction,
            });
          }

          return nextMessages;
        });

        if (!sessionId && data.session_id) {
          router.replace(`/app/chat/${data.session_id}`);
        } else if (data.pending_transaction) {
          setPendingTx(data.pending_transaction);
        }

        void refreshSessions();
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Could not reach your agent. Try again.";
        setChatError(message);
      } finally {
        setTyping(false);
      }
    },
    [activeSessionId, refreshSessions, router, sessionId, title, typing],
  );

  const approvePending = useCallback(async () => {
    if (!pendingTx || approving) return;

    setApproving(true);
    setChatError(null);

    try {
      const data = await postChat({
        message: "Approve transaction",
        session_id: activeSessionId,
        approve_transaction_id: pendingTx.id,
      });

      setActiveSessionId(data.session_id);
      setPendingTx(null);
      setMessages((current) => [
        ...current,
        {
          id: data.message_id,
          role: "agent",
          text: data.reply,
          receipts: mapToolCallsToReceipts(data.tool_calls),
        },
      ]);

      void refreshSessions();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Approval failed. Try again.";
      setChatError(message);
    } finally {
      setApproving(false);
    }
  }, [activeSessionId, approving, pendingTx, refreshSessions]);

  return {
    messages,
    title,
    loading,
    loadError,
    typing,
    chatError,
    pendingTx,
    approving,
    sendMessage,
    approvePending,
    dismissPending: () => setPendingTx(null),
  };
}
