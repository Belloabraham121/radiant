"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowUp, Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { ExecutionTimeline } from "@/components/app/ExecutionTimeline";
import { SidebarToggle } from "@/components/app/Sidebar";
import { AgentMessageMarkdown } from "@/components/app/AgentMessageMarkdown";
import { AgentTransactionDetailDialog } from "@/components/app/AgentTransactionDetailDialog";
import { TransactionApprovalBar } from "@/components/app/TransactionApprovalBar";
import { ClarificationBar } from "@/components/app/ClarificationBar";
import { useChatSession } from "@/hooks/useChatSession";
import type { ChatMessage, Receipt } from "@/lib/chat-messages";
import { chainExplorerTxUrl } from "@/lib/chain-meta";

const CHAT_COL = "mx-auto w-full max-w-[53.76rem]";

function ReceiptPill({
  receipt,
  onViewActivity,
}: {
  receipt: Receipt;
  onViewActivity: (transactionId: string) => void;
}) {
  const explorerUrl =
    receipt.digest && receipt.chainId
      ? chainExplorerTxUrl(receipt.chainId, receipt.digest)
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
          Explorer
          <ExternalLink className="size-3" />
        </a>
      ) : null}
      {receipt.agentTransactionId ? (
        <button
          type="button"
          onClick={() => onViewActivity(receipt.agentTransactionId!)}
          className="font-bold text-[var(--hero-violet)] hover:underline"
        >
          View activity
        </button>
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

function Bubble({
  message,
  onViewActivity,
}: {
  message: ChatMessage;
  onViewActivity: (transactionId: string) => void;
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
        <div
          className={`rounded-3xl border-2 border-(--hero-ink) px-5 py-3.5 text-sm font-medium leading-relaxed ${
            isUser
              ? "rounded-br-md bg-[var(--hero-ink)] text-(--hero-bg)"
              : "rounded-bl-md bg-white shadow-[4px_4px_0_var(--hero-ink)]"
          }`}
        >
          {isUser ? message.text : <AgentMessageMarkdown text={message.text} />}
        </div>

        {message.executionSteps && message.executionSteps.length > 0 ? (
          <ExecutionTimeline
            steps={message.executionSteps}
            onViewActivity={onViewActivity}
          />
        ) : null}

        {message.receipts && message.receipts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.receipts.map((receipt, index) => (
              <ReceiptPill
                key={`${message.id}-receipt-${index}`}
                receipt={receipt}
                onViewActivity={onViewActivity}
              />
            ))}
          </div>
        )}

        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
          <MessageCopyButton text={message.text} isUser={isUser} />
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
  const animatedMessageIdsRef = useRef(new Set<string>());
  const initialBatchDoneRef = useRef(false);
  const [input, setInput] = useState("");
  const [activityTransactionId, setActivityTransactionId] = useState<
    string | null
  >(null);
  const [activityDetailOpen, setActivityDetailOpen] = useState(false);

  const openActivityDetail = (transactionId: string) => {
    setActivityTransactionId(transactionId);
    setActivityDetailOpen(true);
  };

  const {
    messages,
    title,
    hydrating,
    loadError,
    typing,
    chatError,
    pendingTx,
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

  useEffect(() => {
    animatedMessageIdsRef.current.clear();
    initialBatchDoneRef.current = false;
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
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [sessionId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [hydrating, messages, pendingTx, typing]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    void sendMessage(text);
  };

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col">
      <header
        className={`${CHAT_COL} flex items-center justify-between gap-3 px-6 py-4`}
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
            className={`${CHAT_COL} flex h-full items-center justify-center`}
          >
            <p className="text-center text-sm font-semibold text-[var(--hero-coral)]">
              {loadError}
            </p>
          </div>
        ) : (
          <div className={`${CHAT_COL} space-y-6`}>
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
                onViewActivity={openActivityDetail}
              />
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="hero-blink flex items-center gap-1.5 rounded-3xl rounded-bl-md border-2 border-[var(--hero-ink)] bg-white px-5 py-4 shadow-[4px_4px_0_var(--hero-ink)]">
                  <span className="size-2 rounded-full bg-[var(--hero-ink)]/60" />
                  <span className="size-2 rounded-full bg-[var(--hero-ink)]/60" />
                  <span className="size-2 rounded-full bg-[var(--hero-ink)]/60" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {chatError ? (
        <p
          role="alert"
          className={`${CHAT_COL} px-6 pb-2 text-center text-xs font-semibold text-[var(--hero-coral)]`}
        >
          {chatError}
        </p>
      ) : null}

      <div className="shrink-0 px-6 pb-4">
        {pendingClarification ? (
          <ClarificationBar
            className={`${CHAT_COL} mb-3`}
            pending={pendingClarification}
            busy={respondingClarification}
            onRespond={(answer) => void respondClarification(answer)}
          />
        ) : null}

        {pendingTx ? (
          <TransactionApprovalBar
            className={`${CHAT_COL} mb-3`}
            pending={pendingTx}
            busy={approving || rejecting}
            onApprove={() => void approvePending()}
            onCancel={() => void rejectPending()}
          />
        ) : null}

        <form onSubmit={send}>
          <div
            className={`${CHAT_COL} flex items-center gap-3 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] py-1.5 pl-6 pr-1.5 shadow-[3px_3px_0_var(--hero-ink)]`}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell your agent what you want…"
              className="flex-1 bg-transparent text-sm font-semibold placeholder:text-[var(--hero-ink)]/35 focus:outline-none"
              disabled={Boolean(loadError)}
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex size-10 items-center justify-center rounded-full bg-[var(--hero-ink)] text-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
              disabled={
                !input.trim() ||
                typing ||
                Boolean(loadError) ||
                Boolean(pendingTx) ||
                Boolean(pendingClarification)
              }
            >
              <ArrowUp className="size-5" strokeWidth={2.5} />
            </button>
          </div>
          <p
            className={`${CHAT_COL} mt-2 text-center text-[11px] font-medium text-[var(--hero-ink)]/35`}
          >
            Radiant signs transactions with your wallet. Big moves always ask
            first.
          </p>
        </form>
      </div>

      <AgentTransactionDetailDialog
        transactionId={activityTransactionId}
        open={activityDetailOpen}
        onOpenChange={setActivityDetailOpen}
      />
    </div>
  );
}
