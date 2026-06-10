"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Brain, Coins, Hammer, Hand } from "lucide-react";
import { WordReveal } from "./WordReveal";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const PILLARS = [
  {
    Icon: Hand,
    title: "It acts",
    copy: "Swaps, payments, signups, staking. You say it once — Radiant signs and executes. No interfaces to navigate.",
    accent: "var(--hero-coral)",
    tilt: "-rotate-2",
  },
  {
    Icon: Brain,
    title: "It remembers",
    copy: "Wallets, apps, credentials, preferences — across every session. You never repeat yourself.",
    accent: "var(--hero-violet)",
    tilt: "rotate-1",
  },
  {
    Icon: Hammer,
    title: "It builds",
    copy: "Repeatable task? Radiant ships you a real app — deployed to Walrus, owned by your wallet, alive forever.",
    accent: "var(--hero-mint)",
    tilt: "rotate-2",
  },
  {
    Icon: Coins,
    title: "It earns",
    copy: "List what you build. Anyone — human or agent — uses it, and your fee lands onchain. Automatically.",
    accent: "var(--hero-amber)",
    tilt: "-rotate-1",
  },
];

export function PillarsSection() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-pillar]", {
        y: 64,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 70%" },
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-bg)] px-6 py-28 text-[var(--hero-ink)] md:py-40"
    >
      <div className="mx-auto max-w-6xl">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/40">
          Not a chatbot. Not a DeFi app. Not a no-code tool.
        </p>
        <WordReveal
          text="All of it, collapsed into one agent."
          className="mx-auto max-w-4xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
        />

        <div className="mt-20 grid gap-8 sm:grid-cols-2">
          {PILLARS.map(({ Icon, title, copy, accent, tilt }) => (
            <div
              key={title}
              data-pillar
              className={`group rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-8 shadow-[6px_6px_0_var(--hero-ink)] transition-transform duration-300 hover:-translate-y-2 hover:rotate-0 md:p-10 ${tilt}`}
            >
              <span
                className="mb-6 flex size-14 items-center justify-center rounded-2xl border-2 border-[var(--hero-ink)] text-white"
                style={{ backgroundColor: accent }}
              >
                <Icon className="size-7" strokeWidth={2.4} />
              </span>
              <h3 className="font-heading text-3xl font-extrabold tracking-tight">{title}</h3>
              <p className="mt-4 text-base font-medium leading-relaxed text-[var(--hero-ink)]/65">
                {copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
