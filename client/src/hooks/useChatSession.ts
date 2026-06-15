"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  fetchSessionMessages,
  postChat,
  type ClarificationAnswer,
  type PendingClarification,
  type PendingTransaction,
} from "@/lib/chat-api";
import {
  apiMessagesToChatMessages,
  mapToolCallsToMessageExtras,
  receiptFromExecutionStep,
  type ChatMessage,
} from "@/lib/chat-messages";
import {
  mapStreamStepToExecutionStep,
  sortExecutionSteps,
  upsertExecutionStep,
} from "@/lib/chat-execution-steps";
import { postChatStream } from "@/lib/chat-stream";
import { cacheChatSession, takeCachedChatSession } from "@/lib/chat-session-cache";
import { useChatSessions } from "@/components/app/chat-sessions-context";
import { useArtifactContext } from "@/components/app/ArtifactContext";
import type { ChatAppScope } from "@/lib/chat-app-scope";
import {
  subscribePreviewApprovalResolution,
  tryRelayPendingApprovalToPreview,
} from "@/lib/preview-approval-relay";

function initialChatSessionState(sessionId?: string) {
  if (!sessionId) {
    return {
      messages: [] as ChatMessage[],
      title: "New chat",
      hydrating: false,
      skipFetch: true,
      pending_transaction: null as PendingTransaction | null,
      pending_clarification: null as PendingClarification | null,
    };
  }

  const cached = takeCachedChatSession(sessionId);
  if (cached) {
    return {
      messages: cached.messages,
      title: cached.title,
      hydrating: false,
      skipFetch: true,
      pending_transaction: cached.pending_transaction ?? null,
      pending_clarification: cached.pending_clarification ?? null,
    };
  }

  return {
    messages: [] as ChatMessage[],
    title: "New chat",
    hydrating: true,
    skipFetch: false,
    pending_transaction: null as PendingTransaction | null,
    pending_clarification: null as PendingClarification | null,
  };
}

export function useChatSession(sessionId?: string) {
  const router = useRouter();
  const { refreshSessions } = useChatSessions();
  const { openArtifact, updateArtifact, setArtifactStreaming, migrateArtifactSession } =
    useArtifactContext();
  const [boot] = useState(() => initialChatSessionState(sessionId));

  const [messages, setMessages] = useState<ChatMessage[]>(boot.messages);
  const [title, setTitle] = useState(boot.title);
  const [activeSessionId, setActiveSessionId] = useState(sessionId);
  const [hydrating, setHydrating] = useState(boot.hydrating);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<PendingTransaction | null>(
    boot.pending_transaction,
  );
  const [pendingClarification, setPendingClarification] =
    useState<PendingClarification | null>(boot.pending_clarification);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [respondingClarification, setRespondingClarification] = useState(false);
  const [pendingTxRelayedToPreview, setPendingTxRelayedToPreview] = useState(false);

  const applyPendingTransaction = useCallback(
    (pending: PendingTransaction | null, sessionKey?: string) => {
      setPendingTx(pending);
      if (!pending) {
        setPendingTxRelayedToPreview(false);
        return;
      }
      const relayed = tryRelayPendingApprovalToPreview(
        pending,
        sessionKey ?? activeSessionId ?? sessionId,
      );
      setPendingTxRelayedToPreview(relayed);
    },
    [activeSessionId, sessionId],
  );

  useEffect(() => {
    return subscribePreviewApprovalResolution((message) => {
      setPendingTx((current) => (current?.id === message.pendingId ? null : current));
      setPendingTxRelayedToPreview(false);
    });
  }, []);

  useEffect(() => {
    if (!sessionId || boot.skipFetch) {
      return;
    }

    const id = sessionId;

    let cancelled = false;

    async function loadSession() {
      setHydrating(true);
      setLoadError(null);
      try {
        const data = await fetchSessionMessages(id);
        if (cancelled) return;
        setTitle(data.session.title);
        setMessages((current) => {
          if (current.length > 0) {
            return current;
          }
          return apiMessagesToChatMessages(data.messages);
        });
      } catch (err) {
        if (cancelled) return;
        setMessages((current) => (current.length > 0 ? current : []));
        setLoadError(
          err instanceof ApiError ? err.message : "Could not load this conversation.",
        );
      } finally {
        if (!cancelled) {
          setHydrating(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [boot.skipFetch, sessionId]);

  const sendMessage = useCallback(
    async (text: string, appScope?: ChatAppScope | null) => {
      if (!text.trim() || typing || streaming) return;

      const optimisticId = `u-${Date.now()}`;
      const liveAgentId = `a-live-${Date.now()}`;
      setMessages((current) => [
        ...current,
        { id: optimisticId, role: "user", text },
        {
          id: liveAgentId,
          role: "agent",
          text: "",
          streaming: true,
        },
      ]);
      setStreaming(true);
      setChatError(null);

      const artifactSessionKey = sessionId ?? activeSessionId ?? "new";

      try {
        const data = await postChatStream(
          {
            message: text,
            session_id: activeSessionId,
            ...(appScope ? { app_scope: appScope } : {}),
          },
          {
            onStep: (step) => {
              if (step.id === "agent") {
                return;
              }
              setMessages((current) =>
                current.map((message) => {
                  if (message.id !== liveAgentId) {
                    return message;
                  }
                  const nextStep = mapStreamStepToExecutionStep(step);
                  const executionSteps = sortExecutionSteps(
                    upsertExecutionStep(message.executionSteps ?? [], nextStep),
                  );
                  const digestReceipt = receiptFromExecutionStep(nextStep);
                  return {
                    ...message,
                    executionSteps,
                    ...(digestReceipt ? { receipts: [digestReceipt] } : {}),
                  };
                }),
              );
            },
            onArtifact: ({ artifact, streaming }) => {
              const focusPath =
                artifact.files.find((file) => file.path === "app/page.tsx")?.path ??
                artifact.files.find((file) => file.path === "src/App.tsx")?.path ??
                artifact.files.find((file) => file.path === "src/App.jsx")?.path ??
                artifact.files[artifact.files.length - 1]?.path;
              updateArtifact(artifactSessionKey, artifact, {
                streaming,
                open: true,
                activePath: focusPath,
              });
            },
            onReplyDelta: (delta) => {
              setMessages((current) =>
                current.map((message) => {
                  if (message.id !== liveAgentId) {
                    return message;
                  }
                  return {
                    ...message,
                    text: message.text + delta,
                  };
                }),
              );
            },
            onReplyClear: () => {
              setMessages((current) =>
                current.map((message) => {
                  if (message.id !== liveAgentId) {
                    return message;
                  }
                  return {
                    ...message,
                    text: "",
                  };
                }),
              );
            },
          },
        );

        const nextTitle =
          title === "New chat" ? text.slice(0, 60) : title;

        setActiveSessionId(data.session_id);
        setTitle(nextTitle);
        setMessages((current) => {
          const liveMessage = current.find((message) => message.id === liveAgentId);
          const liveSteps = liveMessage?.executionSteps ?? [];
          const finalReply = data.reply.trim() || liveMessage?.text.trim() || "";
          const nextMessages: ChatMessage[] = [
            ...current.filter(
              (message) => message.id !== optimisticId && message.id !== liveAgentId,
            ),
            { id: optimisticId, role: "user", text },
            {
              id: data.message_id,
              role: "agent",
              text: finalReply,
              streaming: false,
              ...mapToolCallsToMessageExtras(data.tool_calls, liveSteps),
              ...(data.artifact ? { artifact: data.artifact } : {}),
            },
          ];

          if (!sessionId && data.session_id) {
            cacheChatSession(data.session_id, {
              messages: nextMessages,
              title: nextTitle,
              pending_transaction: data.pending_transaction,
              pending_clarification: data.pending_clarification,
            });
          }

          return nextMessages;
        });

        applyPendingTransaction(
          data.pending_transaction ?? null,
          data.session_id ?? sessionId ?? activeSessionId ?? undefined,
        );
        setPendingClarification(data.pending_clarification ?? null);

        if (!sessionId && data.session_id && artifactSessionKey === "new") {
          migrateArtifactSession("new", data.session_id);
        }

        const finalArtifactKey = sessionId ?? data.session_id;
        if (data.artifact) {
          updateArtifact(finalArtifactKey, data.artifact, { streaming: false, open: true });
        } else {
          setArtifactStreaming(finalArtifactKey, false);
        }

        if (!sessionId && data.session_id) {
          router.replace(`/app/chat/${data.session_id}`);
        }

        void refreshSessions({ silent: true });
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Could not reach your agent. Try again.";
        setChatError(message);
        setMessages((current) =>
          current.filter((entry) => entry.id !== liveAgentId),
        );
        setArtifactStreaming(artifactSessionKey, false);
      } finally {
        setStreaming(false);
      }
    },
    [
      activeSessionId,
      applyPendingTransaction,
      migrateArtifactSession,
      openArtifact,
      refreshSessions,
      router,
      sessionId,
      setArtifactStreaming,
      streaming,
      title,
      typing,
      updateArtifact,
    ],
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
      applyPendingTransaction(data.pending_transaction ?? null, data.session_id);
      setPendingClarification(data.pending_clarification ?? null);
      setMessages((current) => [
        ...current,
        {
          id: data.message_id,
          role: "agent",
          text: data.reply,
          ...mapToolCallsToMessageExtras(data.tool_calls),
        },
      ]);

      if (data.artifact) {
        const artifactSessionKey = activeSessionId ?? data.session_id;
        openArtifact(artifactSessionKey, data.artifact);
      }

      void refreshSessions({ silent: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Approval failed. Try again.";
      setChatError(message);
    } finally {
      setApproving(false);
    }
  }, [activeSessionId, applyPendingTransaction, approving, openArtifact, pendingTx, refreshSessions]);

  const rejectPending = useCallback(async () => {
    if (!pendingTx || rejecting || approving) return;

    setRejecting(true);
    setChatError(null);

    try {
      const data = await postChat({
        message: "Cancel transaction",
        session_id: activeSessionId,
        reject_transaction_id: pendingTx.id,
      });

      setActiveSessionId(data.session_id);
      applyPendingTransaction(null);
      setPendingClarification(data.pending_clarification ?? null);
      setMessages((current) => [
        ...current,
        { id: `u-reject-${Date.now()}`, role: "user", text: "Cancel transaction" },
        {
          id: data.message_id,
          role: "agent",
          text: data.reply,
          ...mapToolCallsToMessageExtras(data.tool_calls),
        },
      ]);

      if (data.artifact) {
        const artifactSessionKey = activeSessionId ?? data.session_id;
        openArtifact(artifactSessionKey, data.artifact);
      }

      void refreshSessions({ silent: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not cancel the transaction. Try again.";
      setChatError(message);
    } finally {
      setRejecting(false);
    }
  }, [activeSessionId, approving, openArtifact, pendingTx, refreshSessions, rejecting]);

  const respondClarification = useCallback(
    async (answer: ClarificationAnswer) => {
      if (!pendingClarification || respondingClarification) return;

      const userText =
        answer.confirm !== undefined
          ? answer.confirm === "yes"
            ? "Yes"
            : "No"
          : answer.value !== undefined
            ? String(answer.value)
            : answer.selected_option_id ?? answer.selected_option_ids?.join(", ") ?? "Answered";

      setRespondingClarification(true);
      setChatError(null);

      try {
        const data = await postChat({
          message: userText,
          session_id: activeSessionId,
          clarification_id: pendingClarification.id,
          ...(answer.confirm !== undefined
            ? { clarification_confirm: answer.confirm }
            : {}),
          ...(answer.value !== undefined ? { clarification_value: answer.value } : {}),
          ...(answer.selected_option_id
            ? { clarification_option_id: answer.selected_option_id }
            : {}),
          ...(answer.selected_option_ids?.length
            ? { clarification_option_ids: answer.selected_option_ids }
            : {}),
        });

        setActiveSessionId(data.session_id);
        setPendingClarification(data.pending_clarification ?? null);
        applyPendingTransaction(
          data.pending_transaction ?? null,
          data.session_id ?? sessionId ?? activeSessionId ?? undefined,
        );
        setMessages((current) => [
          ...current,
          { id: `u-clarify-${Date.now()}`, role: "user", text: userText },
          {
            id: data.message_id,
            role: "agent",
            text: data.reply,
            ...mapToolCallsToMessageExtras(data.tool_calls),
          },
        ]);

        if (data.artifact) {
          const artifactSessionKey = sessionId ?? activeSessionId ?? data.session_id;
          openArtifact(artifactSessionKey, data.artifact);
        }

        void refreshSessions({ silent: true });
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Could not process your response.";
        setChatError(message);
      } finally {
        setRespondingClarification(false);
      }
    },
    [activeSessionId, openArtifact, pendingClarification, refreshSessions, respondingClarification],
  );

  return {
    messages,
    title,
    activeSessionId,
    hydrating,
    loadError,
    typing,
    streaming,
    chatError,
    pendingTx,
    pendingTxRelayedToPreview,
    pendingClarification,
    approving,
    rejecting,
    respondingClarification,
    sendMessage,
    approvePending,
    rejectPending,
    respondClarification,
    dismissPending: () => applyPendingTransaction(null),
    dismissClarification: () => setPendingClarification(null),
  };
}
