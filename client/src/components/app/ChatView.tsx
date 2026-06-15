"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowUp, Check, Copy, ExternalLink, LayoutPanelLeft, Sparkles } from "lucide-react";
import { ExecutionTimeline } from "@/components/app/ExecutionTimeline";
import { SidebarToggle } from "@/components/app/Sidebar";
import { AgentMessageMarkdown } from "@/components/app/AgentMessageMarkdown";
import { TransactionApprovalBar } from "@/components/app/TransactionApprovalBar";
import { ClarificationBar } from "@/components/app/ClarificationBar";
import { AgentThinkingDots } from "@/components/app/AgentThinkingDots";
import { ResizableArtifactPanel } from "@/components/app/ResizableArtifactPanel";
import { useArtifactSession } from "@/components/app/ArtifactContext";
import { useChatSession } from "@/hooks/useChatSession";
import type { ChatMessage, Receipt } from "@/lib/chat-messages";
import type { ArtifactPayload } from "@/lib/artifact-types";
import { chainExplorerTxUrl } from "@/lib/chain-meta";

const CHAT_COL = "mx-auto w-full max-w-[53.76rem]";
const CHAT_INPUT_MAX_HEIGHT_PX = 160;

function ReceiptPill({ receipt }: { receipt: Receipt }) {
  const explorerUrl =
    receipt.digest
      ? chainExplorerTxUrl(receipt.chainId ?? "sui", receipt.digest)
      : null;

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
          View on Sui Explorer
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
}: {
  artifact: ArtifactPayload;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex max-w-full items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-4 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
    >
      <LayoutPanelLeft className="size-4 shrink-0 text-[var(--hero-violet)]" strokeWidth={2.5} />
      <span className="truncate">View app — {artifact.name}</span>
    </button>
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
            live={message.streaming === true}
          />
        ) : null}

        <div
          className={`rounded-3xl border-2 border-(--hero-ink) px-5 py-3.5 text-sm font-medium leading-relaxed ${
            isUser
              ? "rounded-br-md bg-[var(--hero-ink)] text-(--hero-bg)"
              : "rounded-bl-md bg-white shadow-[4px_4px_0_var(--hero-ink)]"
          }`}
        >
          {isUser ? (
            message.text
          ) : message.streaming && !message.text ? (
            <AgentThinkingDots />
          ) : (
            <AgentMessageMarkdown text={message.text} />
          )}
        </div>

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
    approvePending,
    rejectPending,
    respondClarification,
    dismissClarification,
  } = useChatSession(sessionId);

  const artifactKey = sessionId ?? activeSessionId ?? "new";
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
    void sendMessage(text);
  };

  return (
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
        <span className="flex shrink-0 items-center gap-2 rounded-full border-2  bg-[var(--hero-mint)]/15 px-3 py-1.5 text-xs font-bold text-[var(--hero-mint)]">
          <span className="size-2 rounded-full bg-current" />
          agent online
        </span>
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
            className={`${chatColumnClass} flex items-end gap-3 rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] py-2 pl-6 pr-1.5 shadow-[3px_3px_0_var(--hero-ink)]`}
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
              className="max-h-40 min-h-6 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-sm font-semibold leading-relaxed placeholder:text-[var(--hero-ink)]/35 focus:outline-none"
              disabled={inputDisabled}
            />
            <button
              type="submit"
              aria-label="Send"
              className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--hero-ink)] text-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
              disabled={!canSend}
            >
              <ArrowUp className="size-5" strokeWidth={2.5} />
            </button>
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
  );
}
