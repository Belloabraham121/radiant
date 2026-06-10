"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Check } from "lucide-react";
import { WordReveal } from "./WordReveal";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STEPS = [
  {
    n: "01",
    title: "Say it",
    copy: "Plain language. No wallet connecting, no contract addresses, no tabs.",
    accent: "var(--hero-coral)",
  },
  {
    n: "02",
    title: "Radiant does it",
    copy: "It signs, swaps, registers, deploys — with its own hands and your wallet.",
    accent: "var(--hero-blue)",
  },
  {
    n: "03",
    title: "Yours forever",
    copy: "Anything it builds lives on Walrus, owned by your wallet. Even without Radiant.",
    accent: "var(--hero-mint)",
  },
];

const CHAT: { from: "you" | "radiant"; text: string; done?: boolean }[] = [
  { from: "you", text: "Pay Alex 5 SUI." },
  { from: "radiant", text: "Done. Sent from your main wallet — 0x4f…2a", done: true },
  { from: "you", text: "Now make it weekly." },
  { from: "radiant", text: "Built AutoPay and added it to your dashboard. Runs every Friday.", done: true },
];

export function HowItWorksSection() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-step]", {
        y: 56,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: "[data-steps]", start: "top 75%" },
      });
      gsap.from("[data-bubble]", {
        scale: 0.7,
        y: 24,
        opacity: 0,
        duration: 0.5,
        stagger: 0.35,
        ease: "back.out(1.8)",
        scrollTrigger: { trigger: "[data-chat]", start: "top 70%" },
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-ink)] px-6 py-28 text-[var(--hero-bg)] md:py-40"
    >
      <div className="mx-auto max-w-6xl">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-bg)]/40">
          How it works
        </p>
        <WordReveal
          text="You talk. It does things."
          className="mx-auto max-w-3xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
        />

        <div data-steps className="mt-20 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ n, title, copy, accent }) => (
            <div
              key={n}
              data-step
              className="rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-8 backdrop-blur-sm"
            >
              <span className="font-heading text-5xl font-extrabold" style={{ color: accent }}>
                {n}
              </span>
              <h3 className="mt-4 font-heading text-2xl font-extrabold tracking-tight">{title}</h3>
              <p className="mt-3 text-sm font-medium leading-relaxed text-[var(--hero-bg)]/60">
                {copy}
              </p>
            </div>
          ))}
        </div>

        {/* live-feeling chat */}
        <div
          data-chat
          className="mx-auto mt-20 flex max-w-xl flex-col gap-4 rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-6 md:p-8"
        >
          {CHAT.map((msg, i) =>
            msg.from === "you" ? (
              <div
                key={i}
                data-bubble
                className="self-end rounded-2xl rounded-br-sm bg-[var(--hero-amber)] px-5 py-3 text-sm font-bold text-[var(--hero-ink)]"
              >
                {msg.text}
              </div>
            ) : (
              <div
                key={i}
                data-bubble
                className="flex max-w-[85%] items-start gap-2 self-start rounded-2xl rounded-bl-sm bg-[var(--hero-bg)] px-5 py-3 text-sm font-bold text-[var(--hero-ink)]"
              >
                {msg.done && (
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--hero-mint)]">
                    <Check className="size-3 text-white" strokeWidth={3.5} />
                  </span>
                )}
                {msg.text}
              </div>
            ),
          )}
          <div className="hero-blink flex gap-1 self-start px-2 text-[var(--hero-bg)]/60">
            <span className="size-1.5 rounded-full bg-current" />
            <span className="size-1.5 rounded-full bg-current" />
            <span className="size-1.5 rounded-full bg-current" />
          </div>
        </div>
      </div>
    </section>
  );
}
