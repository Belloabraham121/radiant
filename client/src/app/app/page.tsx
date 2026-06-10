"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowUp, ArrowUpRight, Check, Sparkles } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { CANNED_REPLIES, MESSAGES, type Message } from "@/lib/app-data";

gsap.registerPlugin(useGSAP);

const CHAT_COL = "mx-auto w-full max-w-[53.76rem]";

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div data-bubble className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
        {!isUser && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/40">
            <Sparkles className="size-3 text-[var(--hero-amber)]" strokeWidth={3} />
            Radiant
          </span>
        )}
        <div
          className={`rounded-3xl border-2 border-[var(--hero-ink)] px-5 py-3.5 text-sm font-medium leading-relaxed ${
            isUser
              ? "rounded-br-md bg-[var(--hero-ink)] text-[var(--hero-bg)]"
              : "rounded-bl-md bg-white shadow-[4px_4px_0_var(--hero-ink)]"
          }`}
        >
          {message.text}
        </div>

        {message.receipts && (
          <div className="flex flex-wrap gap-2">
            {message.receipts.map((r) => (
              <span
                key={r.label}
                className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1.5 text-xs font-bold"
              >
                <Check className="size-3.5 text-[var(--hero-mint)]" strokeWidth={3} />
                {r.label}
                {r.detail && (
                  <span className="font-mono font-semibold text-[var(--hero-ink)]/45">
                    {r.detail}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {message.appCard && (
          <Link
            href={`/app/projects/${message.appCard.projectId}`}
            className="group flex items-center gap-4 rounded-2xl border-2 border-[var(--hero-ink)] bg-white p-4 shadow-[4px_4px_0_var(--hero-ink)] transition-transform hover:-translate-y-1"
          >
            <span
              className="flex size-11 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-lg font-extrabold text-white"
              style={{ backgroundColor: message.appCard.accent }}
            >
              {message.appCard.name[0]}
            </span>
            <span>
              <span className="flex items-center gap-1 text-sm font-extrabold">
                {message.appCard.name}
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              <span className="font-mono text-xs font-semibold text-[var(--hero-ink)]/45">
                {message.appCard.url}
              </span>
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const ref = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>(MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const replyIdx = useRef(0);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-bubble]", {
        y: 24,
        opacity: 0,
        duration: 0.55,
        stagger: 0.1,
        ease: "back.out(1.4)",
      });
    },
    { scope: ref },
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing) return;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const reply = CANNED_REPLIES[replyIdx.current % CANNED_REPLIES.length];
      replyIdx.current += 1;
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "agent", text: reply }]);
      setTyping(false);
    }, 1400);
  };

  return (
    <div ref={ref} className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b-2 border-[var(--hero-ink)] bg-white px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarToggle />
          <div className="min-w-0">
            <h1 className="font-heading text-lg font-extrabold tracking-tight">
              Japan trip savings
            </h1>
            <p className="text-xs font-bold text-[var(--hero-ink)]/40">
              your agent remembers everything here
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1.5 text-xs font-bold text-[var(--hero-mint)]">
          <span className="size-2 rounded-full bg-current" />
          agent online
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className={`${CHAT_COL} space-y-6`}>
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
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
      </div>

      <form onSubmit={send} className="px-6 py-4">
        <div className={`${CHAT_COL} flex items-center gap-3 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] py-1.5 pl-6 pr-1.5 shadow-[3px_3px_0_var(--hero-ink)]`}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell your agent what you want…"
            className="flex-1 bg-transparent text-sm font-semibold placeholder:text-[var(--hero-ink)]/35 focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            className="flex size-10 items-center justify-center rounded-full bg-[var(--hero-ink)] text-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
            disabled={!input.trim() || typing}
          >
            <ArrowUp className="size-5" strokeWidth={2.5} />
          </button>
        </div>
        <p className={`${CHAT_COL} mt-2 text-center text-[11px] font-medium text-[var(--hero-ink)]/35`}>
          Radiant signs transactions with your wallet. Big moves always ask first.
        </p>
      </form>
    </div>
  );
}
