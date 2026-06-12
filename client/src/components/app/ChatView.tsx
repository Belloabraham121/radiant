"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowUp, Check, Sparkles } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { TransactionApprovalBar } from "@/components/app/TransactionApprovalBar";
import { useChatSession } from "@/hooks/useChatSession";
import type { ChatMessage } from "@/lib/chat-messages";

const CHAT_COL = "mx-auto w-full max-w-[53.76rem]";

function Bubble({ message }: { message: ChatMessage }) {
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
          {message.text}
        </div>

        {message.receipts && message.receipts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.receipts.map((receipt) => (
              <span
                key={receipt.label}
                className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1.5 text-xs font-bold"
              >
                <Check
                  className="size-3.5 text-[var(--hero-mint)]"
                  strokeWidth={3}
                />
                {receipt.label}
                {receipt.detail && (
                  <span className="font-mono font-semibold text-[var(--hero-ink)]/45">
                    {receipt.detail}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatLoadingSkeleton() {
  return (
    <div className={`${CHAT_COL} space-y-6 px-6 py-8`}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={`flex ${index % 2 === 0 ? "justify-end" : "justify-start"}`}
        >
          <div className="h-12 w-2/5 max-w-sm animate-pulse rounded-3xl border-2 border-[var(--hero-ink)]/15 bg-white/60" />
        </div>
      ))}
    </div>
  );
}

type ChatViewProps = {
  sessionId?: string;
};

export function ChatView({ sessionId }: ChatViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const animatedMessageIdsRef = useRef(new Set<string>());
  const [input, setInput] = useState("");

  const {
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
    dismissPending,
  } = useChatSession(sessionId);

  useEffect(() => {
    animatedMessageIdsRef.current.clear();
  }, [sessionId]);

  useEffect(() => {
    if (loading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const scope = ref.current;
    if (!scope) return;

    const newTargets: Element[] = [];
    for (const message of messages) {
      if (animatedMessageIdsRef.current.has(message.id)) continue;
      const element = scope.querySelector(`[data-message-id="${message.id}"]`);
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
  }, [loading, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, pendingTx]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    void sendMessage(text);
  };

  return (
    <div ref={ref} className="flex h-full flex-col">
      <header
        className={`${CHAT_COL} flex items-center justify-between gap-3 px-6 py-4`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <SidebarToggle />
          <h1 className="truncate font-heading text-lg font-extrabold tracking-tight">
            {title}
          </h1>
        </div>
        <span className="flex shrink-0 items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1.5 text-xs font-bold text-[var(--hero-mint)]">
          <span className="size-2 rounded-full bg-current" />
          agent online
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        {loading ? (
          <ChatLoadingSkeleton />
        ) : loadError ? (
          <div className={`${CHAT_COL} flex h-full items-center justify-center`}>
            <p className="text-center text-sm font-semibold text-[var(--hero-coral)]">
              {loadError}
            </p>
          </div>
        ) : (
          <div className={`${CHAT_COL} space-y-6`}>
            {messages.length === 0 && !typing && (
              <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
                <Sparkles className="size-8 text-[var(--hero-amber)]" strokeWidth={2.5} />
                <p className="font-heading text-lg font-extrabold">Start a conversation</p>
                <p className="max-w-sm text-sm font-medium text-[var(--hero-ink)]/50">
                  Ask about your balance, send tokens, or tell your agent what you want to build.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <Bubble key={message.id} message={message} />
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
        {pendingTx ? (
          <TransactionApprovalBar
            className={`${CHAT_COL} mb-3`}
            pending={pendingTx}
            busy={approving}
            onApprove={() => void approvePending()}
            onCancel={dismissPending}
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
              disabled={!input.trim() || typing || Boolean(loadError) || Boolean(pendingTx)}
            >
              <ArrowUp className="size-5" strokeWidth={2.5} />
            </button>
          </div>
          <p
            className={`${CHAT_COL} mt-2 text-center text-[11px] font-medium text-[var(--hero-ink)]/35`}
          >
            Radiant signs transactions with your wallet. Big moves always ask first.
          </p>
        </form>
      </div>
    </div>
  );
}
