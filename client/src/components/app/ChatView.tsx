"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, LayoutGrid, LayoutPanelLeft, Sparkles, Square } from "lucide-react";
import { ExecutionTimeline } from "@/components/app/ExecutionTimeline";
import { SidebarToggle } from "@/components/app/Sidebar";
import { AgentMessageMarkdown } from "@/components/app/AgentMessageMarkdown";
import { TransactionApprovalBar } from "@/components/app/TransactionApprovalBar";
import { ClarificationBar } from "@/components/app/ClarificationBar";
import { AgentWorkingIndicator } from "@/components/app/AgentWorkingIndicator";
import { ChatAppScopePicker, useChatAppScope } from "@/components/app/ChatAppScopePicker";
import { ChatAgentStreamProvider } from "@/components/app/ChatAgentStreamBridge";
import { ResizableArtifactPanel } from "@/components/app/ResizableArtifactPanel";
import { useArtifactSession } from "@/components/app/ArtifactContext";
import { useChatSession } from "@/hooks/useChatSession";
import type { ChatMessage, Receipt } from "@/lib/chat-messages";
import type { ArtifactPayload } from "@/lib/artifact-types";
import { saveStoredChatAppScope, scopeToChipLabel, type ChatAppScope } from "@/lib/chat-app-scope";
import { requestArtifactPreviewTab } from "@/lib/artifact-preview-tab";
import {
  explorerLinkLabelForReceipt,
  explorerUrlForDigest,
} from "@/lib/explorer-tx-link";

const CHAT_COL = "mx-auto w-full max-w-[53.76rem]";
const CHAT_INPUT_MAX_HEIGHT_PX = 160;

function ReceiptPill({ receipt }: { receipt: Receipt }) {
  const explorerUrl = explorerUrlForDigest(
    receipt.digest,
    receipt.chainId,
    receipt.evmChainId,
  );

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1.5 text-xs font-bold">
      <Check
        className="size-3.5 shrink-0 text-[var(--hero-mint)]"
        strokeWidth={3}
      />
      <span>{receipt.label}</span>
      {receipt.detail ? (
        <span className="font-mono font-semibold text-[var(--hero-ink)]/45">
          {receipt.detail}
        </span>
      ) : null}
      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-bold text-[var(--hero-blue)] hover:underline"
        >
          {explorerLinkLabelForReceipt(receipt.label, receipt.chainId, receipt.evmChainId)}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </span>
  );
}

function MessageCopyButton({
  text,
  isUser,
}: {
  text: string;
  isUser: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={isUser ? "Copy prompt" : "Copy response"}
      title={isUser ? "Copy prompt" : "Copy response"}
      className={`rounded-lg border-2 p-1 transition-all hover:-translate-y-0.5 ${
        copied
          ? "border-[var(--hero-mint)] bg-[var(--hero-mint)]/15 text-[var(--hero-mint)]"
          : "border-[var(--hero-ink)]/15 text-[var(--hero-ink)]/35 hover:border-[var(--hero-ink)]/30 hover:text-[var(--hero-ink)]/60"
      }`}
    >
      {copied ? (
        <Check className="size-3.5" strokeWidth={2.5} />
      ) : (
        <Copy className="size-3.5" strokeWidth={2.5} />
      )}
    </button>
  );
}

function ArtifactViewButton({
  artifact,
  onClick,
  compact = false,
}: {
  artifact: ArtifactPayload;
  onClick: () => void;
  compact?: boolean;
}) {
  const label = compact ? `Open — ${artifact.name}` : `View app — ${artifact.name}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        compact
          ? "inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-3 py-1.5 text-xs font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          : "inline-flex max-w-full items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-4 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
      }
    >
      <LayoutPanelLeft className="size-4 shrink-0 text-[var(--hero-violet)]" strokeWidth={2.5} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function UserMessageAppScopeChip({ scope }: { scope: ChatAppScope }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border-2 border-[var(--hero-ink)]/25 bg-[var(--hero-amber)]/20 px-3 py-1 text-[11px] font-bold text-[var(--hero-ink)]/75">
      <LayoutGrid className="size-3 shrink-0" strokeWidth={2.5} />
      <span className="truncate">{scopeToChipLabel(scope)}</span>
    </span>
  );
}

function Bubble({
  message,
  onViewArtifact,
}: {
  message: ChatMessage;
  onViewArtifact?: (artifact: ArtifactPayload) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div
      data-bubble
      data-message-id={message.id}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}
      >
        {!isUser && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/40">
            <Sparkles className="size-3 text-(--hero-amber)" strokeWidth={3} />
            Radiant
          </span>
        )}

        {message.executionSteps && message.executionSteps.length > 0 ? (
          <ExecutionTimeline
            steps={message.executionSteps}
            live={
              message.streaming === true ||
              message.executionSteps.some((step) => step.status === "running")
            }
            statusCategory={message.statusCategory}
          />
        ) : null}

        {!isUser &&
        message.streaming &&
        !message.text &&
        !(message.executionSteps && message.executionSteps.length > 0) ? (
          <AgentWorkingIndicator
            active={message.streaming}
            category={message.statusCategory ?? "thinking"}
          />
        ) : null}

        {(isUser || message.text?.trim()) && (
        <div
          className={`text-sm font-medium leading-relaxed ${
            isUser
              ? "rounded-3xl rounded-br-md border-2 border-(--hero-ink) bg-[var(--hero-ink)] px-5 py-3.5 text-(--hero-bg)"
              : "max-w-full py-0.5 text-[var(--hero-ink)]"
          }`}
        >
          {isUser ? (
            message.text
          ) : (
            <AgentMessageMarkdown text={message.text} />
          )}
        </div>
        )}

        {isUser && message.appScope ? (
          <UserMessageAppScopeChip scope={message.appScope} />
        ) : null}

        {message.receipts && message.receipts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.receipts.map((receipt, index) => (
              <ReceiptPill
                key={`${message.id}-receipt-${index}`}
                receipt={receipt}
              />
            ))}
          </div>
        )}

        {message.artifact && !message.streaming ? (
          <ArtifactViewButton
            artifact={message.artifact}
            onClick={() => onViewArtifact?.(message.artifact!)}
          />
        ) : null}

        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
          {!message.streaming ? (
            <MessageCopyButton text={message.text} isUser={isUser} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChatHydratingIndicator() {
  return (
    <p
      className={`${CHAT_COL} text-center text-xs font-semibold text-[var(--hero-ink)]/40`}
    >
      Loading conversation…
    </p>
  );
}

type ChatViewProps = {
  sessionId?: string;
};

export function ChatView({ sessionId }: ChatViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const animatedMessageIdsRef = useRef(new Set<string>());
  const initialBatchDoneRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, CHAT_INPUT_MAX_HEIGHT_PX)}px`;
  }, []);

  const resetInputHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
  }, []);

  const {
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
    stopExecution,
    approvePending,
    rejectPending,
    respondClarification,
    dismissClarification,
  } = useChatSession(sessionId);

  const scopeSessionKey = sessionId ?? activeSessionId;
  const { scope: appScope, setScope: setAppScope } = useChatAppScope(scopeSessionKey);

  useEffect(() => {
    saveStoredChatAppScope(scopeSessionKey, appScope);
  }, [scopeSessionKey, appScope]);

  const artifactKey = scopeSessionKey ?? "new";
  const {
    panelOpen,
    payload: artifactPayload,
    activePath,
    streaming: artifactStreaming,
    setActivePath,
    closePanel,
    openArtifact,
    updateArtifact,
  } = useArtifactSession(artifactKey);

  const chatColumnClass =
    panelOpen && artifactPayload ? "mx-auto w-full max-w-none px-0" : CHAT_COL;

  useEffect(() => {
    if (hydrating || panelOpen || artifactPayload) return;
    const lastWithArtifact = [...messages]
      .reverse()
      .find((message) => message.artifact && !message.streaming);
    if (lastWithArtifact?.artifact) {
      openArtifact(lastWithArtifact.artifact);
    }
  }, [artifactPayload, hydrating, messages, openArtifact, panelOpen]);

  useEffect(() => {
    animatedMessageIdsRef.current.clear();
    initialBatchDoneRef.current = false;
    stickToBottomRef.current = true;
  }, [sessionId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 96;
      setShowScrollToBottom(distanceFromBottom > 200);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, [sessionId]);

  useEffect(() => {
    const scope = ref.current;
    if (!scope) return;

    return () => {
      const bubbles = scope.querySelectorAll("[data-message-id]");
      gsap.killTweensOf(bubbles);
      gsap.set(bubbles, { clearProps: "opacity,transform" });
    };
  }, [sessionId]);

  useEffect(() => {
    if (
      hydrating ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const scope = ref.current;
    if (!scope) return;

    if (!initialBatchDoneRef.current) {
      const bubbles = scope.querySelectorAll("[data-message-id]");
      gsap.set(bubbles, { opacity: 1, y: 0, clearProps: "opacity,transform" });
      for (const message of messages) {
        animatedMessageIdsRef.current.add(message.id);
      }
      initialBatchDoneRef.current = true;
      return;
    }

    const newTargets: Element[] = [];
    for (const message of messages) {
      if (animatedMessageIdsRef.current.has(message.id)) continue;
      const element = scope.querySelector(
        `[data-message-id="${CSS.escape(message.id)}"]`,
      );
      if (!element) continue;
      animatedMessageIdsRef.current.add(message.id);
      newTargets.push(element);
    }

    if (newTargets.length === 0) return;

    gsap.from(newTargets, {
      y: 24,
      opacity: 0,
      duration: 0.55,
      stagger: 0.1,
      ease: "back.out(1.4)",
    });
  }, [hydrating, messages]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [sessionId]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [hydrating, messages, pendingTx, typing, streaming]);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  const inputDisabled =
    Boolean(loadError) ||
    Boolean(pendingTx) ||
    Boolean(pendingClarification);
  const canSend =
    Boolean(input.trim()) &&
    !typing &&
    !streaming &&
    !inputDisabled;

  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || typing || streaming) return;
    stickToBottomRef.current = true;
    setInput("");
    resetInputHeight();

    if (appScope) {
      requestArtifactPreviewTab();
      const payload =
        artifactPayload ??
        [...messages].reverse().find((message) => message.artifact)?.artifact;
      if (payload) {
        if (artifactPayload) {
          updateArtifact(artifactPayload, { open: true });
        } else {
          openArtifact(payload);
        }
      }
    }

    const scopeForSend = appScope;
    if (scopeForSend) {
      setAppScope(null);
      saveStoredChatAppScope(scopeSessionKey, null);
    }

    void sendMessage(text, scopeForSend);
  };

  return (
    <ChatAgentStreamProvider sessionId={scopeSessionKey ?? undefined}>
    <div className="flex h-full min-h-0 overflow-hidden">
      <div
        ref={ref}
        className={`flex min-h-0 min-w-0 flex-1 flex-col`}
      >
      <header
        className={`${chatColumnClass} flex items-center justify-between gap-3 px-6 py-4`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <SidebarToggle />
          <h1 className="truncate font-heading text-lg font-extrabold tracking-tight">
            {title}
          </h1>
        </div>
        <div className="flex min-w-0 shrink items-center justify-end">
          {artifactPayload && !panelOpen ? (
            <ArtifactViewButton
              artifact={artifactPayload}
              compact
              onClick={() => updateArtifact(artifactPayload, { open: true })}
            />
          ) : null}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {loadError ? (
          <div
            className={`${chatColumnClass} flex h-full items-center justify-center`}
          >
            <p className="text-center text-sm font-semibold text-[var(--hero-coral)]">
              {loadError}
            </p>
          </div>
        ) : (
          <div className={`${chatColumnClass} space-y-6`}>
            {hydrating && messages.length === 0 ? (
              <ChatHydratingIndicator />
            ) : null}

            {messages.length === 0 && !typing && !hydrating ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
                <Sparkles
                  className="size-8 text-[var(--hero-amber)]"
                  strokeWidth={2.5}
                />
                <p className="font-heading text-lg font-extrabold">
                  Start a conversation
                </p>
                <p className="max-w-sm text-sm font-medium text-[var(--hero-ink)]/50">
                  Ask about your balance, send tokens, or tell your agent what
                  you want to build.
                </p>
              </div>
            ) : null}

            {messages.map((message) => (
              <Bubble
                key={message.id}
                message={message}
                onViewArtifact={(artifact) => openArtifact(artifact)}
              />
            ))}

            <div ref={endRef} />
          </div>
        )}
      </div>

      {showScrollToBottom ? (
        <div className="pointer-events-none relative z-10 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const container = scrollRef.current;
              if (container) {
                container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
              }
              setShowScrollToBottom(false);
            }}
            className="pointer-events-auto -mt-6 flex size-9 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-white shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      ) : null}

      {chatError ? (
        <p
          role="alert"
          className={`${chatColumnClass} px-6 pb-2 text-center text-xs font-semibold text-[var(--hero-coral)]`}
        >
          {chatError}
        </p>
      ) : null}

      <div className="shrink-0 px-6 pb-4">
        {pendingClarification ? (
          <ClarificationBar
            className={`${chatColumnClass} mb-3`}
            pending={pendingClarification}
            busy={respondingClarification}
            onRespond={(answer) => void respondClarification(answer)}
          />
        ) : null}

        {pendingTx && !pendingTxRelayedToPreview ? (
          <TransactionApprovalBar
            className={`${chatColumnClass} mb-3`}
            pending={pendingTx}
            busy={approving || rejecting}
            onApprove={() => void approvePending()}
            onCancel={() => void rejectPending()}
          />
        ) : null}

        <form onSubmit={send}>
          <div
            className={`${chatColumnClass} flex min-h-[4.5rem] flex-col gap-2 rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-5 pb-3 pt-4 shadow-[3px_3px_0_var(--hero-ink)]`}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) send();
                }
              }}
              placeholder="Tell your agent what you want…"
              rows={1}
              className="max-h-40 min-h-6 w-full resize-none overflow-y-auto bg-transparent text-sm font-semibold leading-5 placeholder:text-[var(--hero-ink)]/35 focus:outline-none"
              disabled={inputDisabled}
            />
            <div className="flex items-center justify-between gap-2">
              <ChatAppScopePicker
                sessionId={scopeSessionKey}
                input={input}
                onInputChange={setInput}
                scope={appScope}
                onScopeChange={setAppScope}
                disabled={inputDisabled}
              />
              {streaming ? (
                <button
                  type="button"
                  aria-label="Stop"
                  onClick={() => stopExecution()}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)] text-white shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Square className="size-3.5 fill-current" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hero-ink)] text-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                  disabled={!canSend}
                >
                  <ArrowUp className="size-5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
          <p
            className={`${chatColumnClass} mt-2 text-center text-[11px] font-medium text-[var(--hero-ink)]/35`}
          >
            Radiant signs transactions with your wallet. Big moves always ask
            first.
          </p>
        </form>
      </div>
      </div>

      {panelOpen && artifactPayload ? (
        <ResizableArtifactPanel
          payload={artifactPayload}
          activePath={activePath}
          streaming={artifactStreaming}
          sessionId={sessionId ?? activeSessionId ?? undefined}
          onActivePathChange={setActivePath}
          onPayloadChange={(artifact) => updateArtifact(artifact, { open: true })}
          onClose={closePanel}
        />
      ) : null}
    </div>
    </ChatAgentStreamProvider>
  );
}
