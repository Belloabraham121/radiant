"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { messageForChatStreamError } from "@/lib/api-error-messages";
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
  mergeReceiptsFromExecutionStep,
  type ChatMessage,
} from "@/lib/chat-messages";
import {
  mapStreamStepToExecutionStep,
  mapToolCallsToExecutionSteps,
  mergeExecutionSteps,
  sortExecutionSteps,
  upsertExecutionStep,
  executionStepFromPreviewResult,
  type StreamExecutionStepPayload,
} from "@/lib/chat-execution-steps";
import {
  getAgentTransaction,
  listSessionAgentTransactions,
  refreshAgentTransactionQuote,
  type AgentTransactionDetail,
} from "@/lib/agent-transactions-api";
import {
  loadClaimableLifiContinuationPending,
} from "@/lib/lifi-continuation-pending";
import {
  acceptLiquidityFallback,
  isLiquidityFallbackPending,
  rejectLiquidityFallback,
} from "@/lib/cross-chain-fallback";
import {
  applyCrossChainLiveUpdateToMessages,
  applyOptimisticCrossChainApprovalToMessages,
  collectTrackedCrossChainTransactionIds,
  executionStepsFromAgentTransaction,
  foldApproveOutcomeIntoLifiMessage,
  isCrossChainPending,
  isInFlightCrossChainTransaction,
  markFallbackOfferDeclinedInMessages,
  mergeCrossChainTransactionStepsIntoMessages,
} from "@/lib/cross-chain-execution-tracking";
import {
  isApproveRequestTimeout,
  isLifiAgentTransaction,
  resolveApproveCatchOutcome,
  type ApproveCatchOutcome,
} from "@/lib/lifi-approve-recovery";
import { agentStreamUrl } from "@/lib/agent-stream";
import { ChatStreamAbortedError, postChatStream } from "@/lib/chat-stream";
import {
  cacheChatSession,
  takeCachedChatSession,
} from "@/lib/chat-session-cache";
import { useChatSessions } from "@/components/app/chat-sessions-context";
import { useArtifactContext } from "@/components/app/ArtifactContext";
import type { ChatAppScope } from "@/lib/chat-app-scope";
import type { AgentStatusCategory } from "@/lib/agent-status-category";
import { inferStatusCategoryFromStep } from "@/lib/agent-status-category";
import {
  subscribePreviewApprovalResolution,
} from "@/lib/preview-approval-relay";
import {
  previewExecuteResultToPending,
  subscribePreviewExecuteResult,
} from "@/lib/preview-execute-result";
import { clarificationAnswerDisplayText } from "@/lib/clarification-display";

function isLifiDestinationContinuation(
  pending: PendingTransaction | null | undefined,
): boolean {
  if (!pending) {
    return false;
  }
  return (
    pending.params?.lifi_continuation === true ||
    pending.params?.approval_kind === "lifi_continue" ||
    pending.defi_preview?.kind === "lifi_continue"
  );
}

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

export function useChatSession(sessionId?: string, draftResetKey = 0) {
  const router = useRouter();
  const { refreshSessions } = useChatSessions();
  const {
    openArtifact,
    updateArtifact,
    setArtifactStreaming,
    migrateArtifactSession,
    closePanel,
  } = useArtifactContext();
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
  const [refreshingQuote, setRefreshingQuote] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [acceptingFallback, setAcceptingFallback] = useState(false);
  const [rejectingFallback, setRejectingFallback] = useState(false);
  const [respondingClarification, setRespondingClarification] = useState(false);
  const [pendingTxRelayedToPreview, setPendingTxRelayedToPreview] =
    useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const pendingTxRef = useRef<PendingTransaction | null>(boot.pending_transaction);
  const approvingRef = useRef(false);
  const approvingTransactionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(boot.messages);
  const draftResetKeyRef = useRef(draftResetKey);

  useEffect(() => {
    pendingTxRef.current = pendingTx;
  }, [pendingTx]);

  useEffect(() => {
    approvingRef.current = approving;
  }, [approving]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const applyPendingTransaction = useCallback(
    (
      pending: PendingTransaction | null,
      sessionKey?: string,
      options?: { fromPreview?: boolean },
    ) => {
      setPendingTx(pending);
      if (!pending) {
        setPendingTxRelayedToPreview(false);
        return;
      }

      if (options?.fromPreview) {
        // The preview iframe already shows its own in-app approval modal —
        // mark as relayed so the chat hides its approval bar.
        setPendingTxRelayedToPreview(true);
      } else {
        // Chat-initiated transaction (execute_transaction / call_app_action) —
        // approval stays in the chat bar; never relay to the preview iframe.
        setPendingTxRelayedToPreview(false);
      }
    },
    [],
  );

  const resetToDraftChat = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    approvingTransactionIdRef.current = null;
    setMessages([]);
    setTitle("New chat");
    setActiveSessionId(undefined);
    setHydrating(false);
    setLoadError(null);
    setTyping(false);
    setStreaming(false);
    setChatError(null);
    applyPendingTransaction(null);
    setPendingClarification(null);
    setApproving(false);
    setRejecting(false);
    setAcceptingFallback(false);
    setRejectingFallback(false);
    setRespondingClarification(false);
    setPendingTxRelayedToPreview(false);
    closePanel("new");
  }, [applyPendingTransaction, closePanel]);

  useEffect(() => {
    if (sessionId) {
      return;
    }
    if (draftResetKey === draftResetKeyRef.current) {
      return;
    }
    draftResetKeyRef.current = draftResetKey;
    if (draftResetKey === 0) {
      return;
    }
    resetToDraftChat();
  }, [draftResetKey, resetToDraftChat, sessionId]);

  const syncPendingContinuationFromSession = useCallback(
    async (sessionKey: string, options?: { force?: boolean }) => {
      if (!options?.force && pendingTxRef.current) {
        return;
      }
      if (approvingTransactionIdRef.current) {
        return;
      }

      try {
        const { items } = await listSessionAgentTransactions(sessionKey);
        const pending = await loadClaimableLifiContinuationPending(items);
        if (pending) {
          applyPendingTransaction(pending, sessionKey);
        }
      } catch {
        // Best-effort — poll will retry.
      }
    },
    [applyPendingTransaction],
  );

  useEffect(() => {
    return subscribePreviewApprovalResolution((message) => {
      setPendingTx((current) =>
        current?.id === message.pendingId ? null : current,
      );
      setPendingTxRelayedToPreview(false);

      if (message.status === "executed" && message.digest) {
        setMessages((current) => {
          const agentIndex = [...current]
            .reverse()
            .findIndex((m) => m.role === "agent");
          if (agentIndex === -1) return current;
          const index = current.length - 1 - agentIndex;
          const messageRow = current[index];
          if (!messageRow) return current;

          const nextStep = executionStepFromPreviewResult({
            action: "swap",
            status: "executed",
            digest: message.digest,
          });
          const executionSteps = sortExecutionSteps(
            upsertExecutionStep(messageRow.executionSteps ?? [], nextStep),
          );
          const digestReceipt = receiptFromExecutionStep(nextStep);

          return current.map((row, i) =>
            i === index
              ? {
                  ...row,
                  executionSteps,
                  ...(digestReceipt ? { receipts: [digestReceipt] } : {}),
                }
              : row,
          );
        });
      }
    });
  }, []);

  useEffect(() => {
    return subscribePreviewExecuteResult((message) => {
      const pending = previewExecuteResultToPending(message);
      if (pending) {
        applyPendingTransaction(pending, activeSessionId ?? sessionId, {
          fromPreview: true,
        });
      }

      setMessages((current) => {
        const agentIndex = [...current]
          .reverse()
          .findIndex((m) => m.role === "agent");
        if (agentIndex === -1) return current;
        const index = current.length - 1 - agentIndex;
        const messageRow = current[index];
        if (!messageRow) return current;

        const nextStep = executionStepFromPreviewResult({
          action: message.action,
          status: message.status,
          digest: message.digest,
          message: message.message,
        });
        const executionSteps = sortExecutionSteps(
          upsertExecutionStep(messageRow.executionSteps ?? [], nextStep),
        );
        const digestReceipt = receiptFromExecutionStep(nextStep);

        return current.map((row, i) =>
          i === index
            ? {
                ...row,
                executionSteps,
                ...(digestReceipt ? { receipts: [digestReceipt] } : {}),
              }
            : row,
        );
      });
    });
  }, [activeSessionId, applyPendingTransaction, sessionId]);

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
          err instanceof ApiError
            ? err.message
            : "Could not load this conversation.",
        );
      } finally {
        if (!cancelled) {
          setHydrating(false);
        }
      }
    }

    void loadSession().then(() => {
      if (!cancelled) {
        void syncPendingContinuationFromSession(id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [boot.skipFetch, sessionId, syncPendingContinuationFromSession]);

  useEffect(() => {
    if (!sessionId || hydrating) {
      return;
    }

    let cancelled = false;

    async function hydrateInFlightLifiTransactions() {
      try {
        const { items } = await listSessionAgentTransactions(sessionId!);
        const inFlight = items.filter(isInFlightCrossChainTransaction);
        if (inFlight.length === 0) {
          return;
        }

        const details = new Map<string, AgentTransactionDetail>();
        await Promise.all(
          inFlight.map(async (tx) => {
            const detail = await getAgentTransaction(tx.id);
            if (!cancelled) {
              details.set(tx.id, detail);
            }
          }),
        );

        if (cancelled) return;

        setMessages((current) =>
          mergeCrossChainTransactionStepsIntoMessages(current, inFlight, details),
        );
      } catch {
        // Best-effort hydration — polling will retry.
      }
    }

    void hydrateInFlightLifiTransactions().then(() => {
      if (!cancelled) {
        void syncPendingContinuationFromSession(sessionId!, { force: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hydrating, sessionId, syncPendingContinuationFromSession]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pollInFlightTransactions() {
      try {
        const { items } = await listSessionAgentTransactions(activeSessionId!);
        const inFlight = items.filter(isInFlightCrossChainTransaction);
        const trackedIds = collectTrackedCrossChainTransactionIds(messagesRef.current);
        const pollIds = [
          ...new Set([
            ...inFlight.map((tx) => tx.id),
            ...trackedIds,
            ...(approvingTransactionIdRef.current
              ? [approvingTransactionIdRef.current]
              : []),
          ]),
        ];

        if (!pendingTxRef.current) {
          await syncPendingContinuationFromSession(activeSessionId!, {
            force: true,
          });
        }

        if (pollIds.length === 0 || cancelled) {
          return;
        }

        for (const txId of pollIds) {
          const detail = await getAgentTransaction(txId);
          if (cancelled) return;
          const steps = executionStepsFromAgentTransaction(
            detail,
            detail.result as Record<string, unknown> | null,
          );
          if (!steps?.length) {
            continue;
          }

          setMessages((current) =>
            applyCrossChainLiveUpdateToMessages(current, txId, steps, {
              primaryMessageId: detail.message_id,
              detail,
            }),
          );
        }
      } catch {
        // Ignore transient poll failures.
      } finally {
        if (!cancelled) {
          const fastPoll =
            approvingRef.current ||
            approvingTransactionIdRef.current !== null ||
            collectTrackedCrossChainTransactionIds(messagesRef.current).length > 0;
          timer = setTimeout(() => {
            void pollInFlightTransactions();
          }, fastPoll ? 2_000 : 10_000);
        }
      }
    }

    void pollInFlightTransactions();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeSessionId, syncPendingContinuationFromSession]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    const source = new EventSource(agentStreamUrl(activeSessionId), {
      withCredentials: true,
    });

    function handleExecutionStep(event: MessageEvent<string>) {
      let payload: {
        execution_step?: StreamExecutionStepPayload;
      };
      try {
        payload = JSON.parse(event.data) as typeof payload;
      } catch {
        return;
      }

      const raw = payload.execution_step;
      if (!raw?.id) {
        return;
      }

      const incoming = mapStreamStepToExecutionStep(raw);

      setMessages((current) => {
        if (incoming.agentTransactionId) {
          return applyCrossChainLiveUpdateToMessages(
            current,
            incoming.agentTransactionId,
            [incoming],
          );
        }

        const targetIndex = [...current]
          .reverse()
          .findIndex(
            (message) =>
              message.role === "agent" &&
              message.executionSteps?.some(
                (step) =>
                  step.agentTransactionId === incoming.agentTransactionId ||
                  step.id.startsWith("lifi-"),
              ),
          );
        if (targetIndex === -1) {
          const lastAgentIndex = [...current]
            .reverse()
            .findIndex((message) => message.role === "agent");
          if (lastAgentIndex === -1) {
            return current;
          }
          const index = current.length - 1 - lastAgentIndex;
          const messageRow = current[index];
          if (!messageRow) {
            return current;
          }
          const executionSteps = sortExecutionSteps(
            upsertExecutionStep(messageRow.executionSteps ?? [], incoming),
          );
          const receipts = mergeReceiptsFromExecutionStep(
            messageRow.receipts,
            incoming,
          );
          return current.map((row, i) =>
            i === index
              ? {
                  ...row,
                  executionSteps,
                  ...(receipts ? { receipts } : {}),
                }
              : row,
          );
        }

        const index = current.length - 1 - targetIndex;
        const messageRow = current[index];
        if (!messageRow) {
          return current;
        }
        const executionSteps = sortExecutionSteps(
          upsertExecutionStep(messageRow.executionSteps ?? [], incoming),
        );
        const receipts = mergeReceiptsFromExecutionStep(messageRow.receipts, incoming);
        return current.map((row, i) =>
          i === index
            ? {
                ...row,
                executionSteps,
                ...(receipts ? { receipts } : {}),
              }
            : row,
        );
      });
    }

    source.addEventListener("execution_step", handleExecutionStep);

    return () => {
      source.removeEventListener("execution_step", handleExecutionStep);
      source.close();
    };
  }, [activeSessionId]);

  const sendMessage = useCallback(
    async (text: string, appScope?: ChatAppScope | null) => {
      if (!text.trim() || typing || streaming) return;

      const optimisticId = `u-${Date.now()}`;
      const liveAgentId = `a-live-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: optimisticId,
        role: "user",
        text,
        ...(appScope ? { appScope } : {}),
      };
      setMessages((current) => [
        ...current,
        userMessage,
        {
          id: liveAgentId,
          role: "agent",
          text: "",
          streaming: true,
          statusCategory: "thinking",
        },
      ]);
      setStreaming(true);
      setChatError(null);

      const artifactSessionKey = sessionId ?? activeSessionId ?? "new";
      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        const data = await postChatStream(
          {
            message: text,
            session_id: activeSessionId,
            ...(appScope ? { app_scope: appScope } : {}),
          },
          {
            onSession: (streamSessionId) => {
              setActiveSessionId(streamSessionId);
            },
            onStatus: (category: AgentStatusCategory) => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === liveAgentId
                    ? { ...message, statusCategory: category }
                    : message,
                ),
              );
            },
            onStep: (step) => {
              if (step.id === "agent") {
                return;
              }
              const stepCategory = inferStatusCategoryFromStep(step);
              setMessages((current) =>
                current.map((message) => {
                  if (message.id !== liveAgentId) {
                    return message;
                  }
                  const nextStep = mapStreamStepToExecutionStep(step);
                  const executionSteps = sortExecutionSteps(
                    upsertExecutionStep(message.executionSteps ?? [], nextStep),
                  );
                  const receipts = mergeReceiptsFromExecutionStep(
                    message.receipts,
                    nextStep,
                  );
                  return {
                    ...message,
                    statusCategory: step.status_category ?? stepCategory,
                    executionSteps,
                    ...(receipts ? { receipts } : {}),
                  };
                }),
              );
            },
            onArtifact: ({ artifact, streaming }) => {
              const focusPath =
                artifact.files.find((file) => file.path === "app/page.tsx")
                  ?.path ??
                artifact.files.find((file) => file.path === "src/App.tsx")
                  ?.path ??
                artifact.files.find((file) => file.path === "src/App.jsx")
                  ?.path ??
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
          { signal: controller.signal },
        );

        const nextTitle = title === "New chat" ? text.slice(0, 60) : title;

        setActiveSessionId(data.session_id);
        setTitle(nextTitle);
        setMessages((current) => {
          const liveMessage = current.find(
            (message) => message.id === liveAgentId,
          );
          const liveSteps = liveMessage?.executionSteps ?? [];
          const finalReply =
            data.reply.trim() || liveMessage?.text.trim() || "";
          const nextMessages: ChatMessage[] = [
            ...current.filter(
              (message) =>
                message.id !== optimisticId && message.id !== liveAgentId,
            ),
            {
              id: optimisticId,
              role: "user",
              text,
              ...(appScope ? { appScope } : {}),
            },
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
          updateArtifact(finalArtifactKey, data.artifact, {
            streaming: false,
            open: true,
          });
        } else {
          setArtifactStreaming(finalArtifactKey, false);
        }

        if (!sessionId && data.session_id) {
          router.replace(`/app/chat/${data.session_id}`);
        }

        void refreshSessions({ silent: true });
      } catch (err) {
        if (err instanceof ChatStreamAbortedError) {
          setMessages((current) =>
            current.map((message) =>
              message.id === liveAgentId
                ? {
                    ...message,
                    streaming: false,
                    text: message.text.trim() || "Stopped.",
                  }
                : message,
            ),
          );
          setArtifactStreaming(artifactSessionKey, false);
        } else {
          const message =
            err instanceof ApiError
              ? (messageForChatStreamError(err.code) ?? err.message)
              : "Could not reach your agent. Try again.";
          setChatError(message);
          setMessages((current) =>
            current.filter((entry) => entry.id !== liveAgentId),
          );
          setArtifactStreaming(artifactSessionKey, false);
        }
      } finally {
        streamAbortRef.current = null;
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

    const snapshot = pendingTx;

    setApproving(true);
    setChatError(null);
    approvingTransactionIdRef.current = snapshot.id;
    applyPendingTransaction(null);

    const isCrossChain = isCrossChainPending(snapshot);
    if (isCrossChain) {
      setMessages((current) =>
        applyOptimisticCrossChainApprovalToMessages(current, snapshot),
      );

      void (async () => {
        try {
          const detail = await getAgentTransaction(snapshot.id);
          const steps = executionStepsFromAgentTransaction(
            detail,
            detail.result as Record<string, unknown> | null,
          );
          if (!steps?.length) {
            return;
          }
          setMessages((current) =>
            applyCrossChainLiveUpdateToMessages(current, snapshot.id, steps, {
              primaryMessageId: detail.message_id,
              detail,
            }),
          );
        } catch {
          // Execute may not be persisted yet; SSE and background poll will retry.
        }
      })();
    }

    try {
      const data = await postChat({
        message: "Approve transaction",
        session_id: activeSessionId,
        approve_transaction_id: snapshot.id,
      });

      setActiveSessionId(data.session_id);
      const isToolFailure = data.tool_calls.some(
        (call) =>
          call.name === "execute_transaction" &&
          typeof call.result === "object" &&
          call.result !== null &&
          "error" in call.result,
      );
      const nextPending = isToolFailure
        ? (data.pending_transaction ?? null)
        : isLifiDestinationContinuation(data.pending_transaction)
          ? data.pending_transaction
          : null;
      applyPendingTransaction(nextPending, data.session_id);
      setPendingClarification(data.pending_clarification ?? null);
      if (isToolFailure && data.pending_transaction) {
        setChatError(data.reply);
      } else if (!isToolFailure) {
        setChatError(null);
      }

      const approvedSteps = mapToolCallsToExecutionSteps(data.tool_calls);
      const approveExtras = mapToolCallsToMessageExtras(data.tool_calls);
      const { executionSteps: _omitSteps, ...approveMessageExtras } =
        approveExtras;

      setMessages((current) => {
        if (isToolFailure) {
          return [
            ...current,
            {
              id: `u-approve-${Date.now()}`,
              role: "user",
              text: "Approve transaction",
            },
            {
              id: data.message_id,
              role: "agent",
              text: data.reply,
              ...approveExtras,
            },
          ];
        }

        const folded = foldApproveOutcomeIntoLifiMessage(current, snapshot.id, {
          reply: data.reply,
          steps: approvedSteps,
          receipts: approveExtras.receipts,
        });

        if (folded.folded) {
          return folded.messages;
        }

        return [
          ...current,
          {
            id: `u-approve-${Date.now()}`,
            role: "user",
            text: "Approve transaction",
          },
          {
            id: data.message_id,
            role: "agent",
            text: data.reply,
            ...approveMessageExtras,
          },
        ];
      });

      if (!isToolFailure) {
        void (async () => {
          try {
            const detail = await getAgentTransaction(snapshot.id);
            const steps = executionStepsFromAgentTransaction(
              detail,
              detail.result as Record<string, unknown> | null,
            );
            if (!steps?.length) {
              return;
            }
            setMessages((current) =>
              applyCrossChainLiveUpdateToMessages(current, snapshot.id, steps, {
                primaryMessageId: detail.message_id,
                detail,
              }),
            );
          } catch {
            // Ignore transient refresh failures; background poll will retry.
          }
        })();
      }

      if (data.artifact) {
        const artifactSessionKey = activeSessionId ?? data.session_id;
        openArtifact(artifactSessionKey, data.artifact);
      }

      void refreshSessions({ silent: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (messageForChatStreamError(err.code) ?? err.message)
          : "Approval failed. Try again.";
      const timedOut = isApproveRequestTimeout(err);
      const snapshotIsCrossChain =
        isCrossChainPending(snapshot) || isLifiAgentTransaction(snapshot);

      let outcome: ApproveCatchOutcome = {
        kind: "uncertain",
        message,
      };

      try {
        const detail = await getAgentTransaction(snapshot.id);
        outcome = resolveApproveCatchOutcome(
          detail,
          snapshot.id,
          timedOut,
          message,
        );
        const steps = executionStepsFromAgentTransaction(
          detail,
          detail.result as Record<string, unknown> | null,
        );
        if (steps?.length) {
          setMessages((current) =>
            applyCrossChainLiveUpdateToMessages(current, snapshot.id, steps, {
              primaryMessageId: detail.message_id,
              detail,
            }),
          );
        }
      } catch {
        if (timedOut && snapshotIsCrossChain) {
          outcome = { kind: "in_flight", message: null };
        }
      }

      if (outcome.kind === "restore_pending") {
        applyPendingTransaction(snapshot);
        setChatError(outcome.message);
      } else if (outcome.kind === "in_flight") {
        setChatError(null);
      } else {
        setChatError(outcome.message);
      }
    } finally {
      approvingTransactionIdRef.current = null;
      setApproving(false);
    }
  }, [
    activeSessionId,
    applyPendingTransaction,
    approving,
    openArtifact,
    pendingTx,
    refreshSessions,
    rejecting,
  ]);

  const refreshPendingQuote = useCallback(async () => {
    if (!pendingTx || approving || refreshingQuote || rejecting) {
      return;
    }

    setRefreshingQuote(true);
    setChatError(null);

    try {
      const result = await refreshAgentTransactionQuote(pendingTx.id);
      applyPendingTransaction(result.pending, activeSessionId ?? undefined);
    } catch (err) {
      setChatError(
        err instanceof ApiError ? err.message : "Could not refresh the quote. Try again.",
      );
    } finally {
      setRefreshingQuote(false);
    }
  }, [
    activeSessionId,
    applyPendingTransaction,
    approving,
    pendingTx,
    refreshingQuote,
    rejecting,
  ]);

  const acceptLiquidityFallbackPending = useCallback(async () => {
    if (!isLiquidityFallbackPending(pendingTx) || acceptingFallback || rejectingFallback) {
      return;
    }

    const offerId = pendingTx.liquidity_fallback_offer.fallback_offer_id;
    setAcceptingFallback(true);
    setChatError(null);

    try {
      const result = await acceptLiquidityFallback(offerId);
      applyPendingTransaction(result.pending, activeSessionId ?? undefined);
      setChatError(null);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (messageForChatStreamError(err.code) ?? err.message)
          : "Could not load an alternate route. Try again.";
      setChatError(message);
    } finally {
      setAcceptingFallback(false);
    }
  }, [
    acceptingFallback,
    activeSessionId,
    applyPendingTransaction,
    pendingTx,
    rejectingFallback,
  ]);

  const rejectLiquidityFallbackPending = useCallback(async () => {
    if (!isLiquidityFallbackPending(pendingTx) || acceptingFallback || rejectingFallback) {
      return;
    }

    const offerId = pendingTx.liquidity_fallback_offer.fallback_offer_id;
    setRejectingFallback(true);
    setChatError(null);

    try {
      await rejectLiquidityFallback(offerId);
      applyPendingTransaction(null);
      setMessages((current) => markFallbackOfferDeclinedInMessages(current));
      setChatError(null);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not decline the alternate route offer. Try again.";
      setChatError(message);
    } finally {
      setRejectingFallback(false);
    }
  }, [
    acceptingFallback,
    applyPendingTransaction,
    pendingTx,
    rejectingFallback,
  ]);

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
        {
          id: `u-reject-${Date.now()}`,
          role: "user",
          text: "Cancel transaction",
        },
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
        err instanceof ApiError
          ? err.message
          : "Could not cancel the transaction. Try again.";
      setChatError(message);
    } finally {
      setRejecting(false);
    }
  }, [
    activeSessionId,
    approving,
    openArtifact,
    pendingTx,
    refreshSessions,
    rejecting,
  ]);

  const respondClarification = useCallback(
    async (answer: ClarificationAnswer) => {
      if (!pendingClarification || respondingClarification) return;

      const userText = clarificationAnswerDisplayText(pendingClarification, answer);

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
          ...(answer.value !== undefined
            ? { clarification_value: answer.value }
            : {}),
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
          const artifactSessionKey =
            sessionId ?? activeSessionId ?? data.session_id;
          openArtifact(artifactSessionKey, data.artifact);
        }

        void refreshSessions({ silent: true });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "Could not process your response.";
        setChatError(message);
      } finally {
        setRespondingClarification(false);
      }
    },
    [
      activeSessionId,
      openArtifact,
      pendingClarification,
      refreshSessions,
      respondingClarification,
    ],
  );

  const stopExecution = useCallback(() => {
    streamAbortRef.current?.abort();
  }, []);

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
    refreshingQuote,
    acceptingFallback,
    rejectingFallback,
    respondingClarification,
    sendMessage,
    stopExecution,
    approvePending,
    refreshPendingQuote,
    rejectPending,
    acceptLiquidityFallbackPending,
    rejectLiquidityFallbackPending,
    respondClarification,
    dismissPending: () => applyPendingTransaction(null),
    dismissClarification: () => setPendingClarification(null),
  };
}
