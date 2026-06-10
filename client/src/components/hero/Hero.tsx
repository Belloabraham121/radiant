"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowDown, ArrowRight, Brain, Hand, Sparkles, Wallet } from "lucide-react";
import { EvolvingWord } from "./EvolvingWord";
import { MARQUEE_COMMANDS } from "./apps";

const CHIPS = [
  { label: "wallet", Icon: Wallet, color: "var(--hero-blue)" },
  { label: "memory", Icon: Brain, color: "var(--hero-violet)" },
  { label: "hands", Icon: Hand, color: "var(--hero-coral)" },
];

export function Hero() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(
        "[data-hero-fade]",
        { y: 36, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          stagger: 0.12,
          ease: "power3.out",
          delay: 0.15,
        },
      );
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      className="hero-selection relative flex min-h-screen flex-col overflow-hidden bg-[var(--hero-bg)] text-[var(--hero-ink)]"
    >
      <Decor />

      {/* nav */}
      <header
        data-hero-fade
        className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12"
      >
        <a href="#" className="flex items-center gap-2 font-heading text-2xl font-extrabold">
          <Sparkles className="size-6 text-[var(--hero-amber)]" strokeWidth={2.5} />
          Radiant
        </a>
        <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
          <a href="#" className="transition-colors hover:text-[var(--hero-blue)]">
            Explorer
          </a>
          <a href="#" className="transition-colors hover:text-[var(--hero-blue)]">
            Docs
          </a>
        </nav>
        <a
          href="#"
          className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-5 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-amber)] transition-transform hover:-translate-y-0.5"
        >
          Try Radiant
        </a>
      </header>

      {/* title zone */}
      <main className="relative z-10 flex flex-1 flex-col items-center px-6 pt-10 text-center md:pt-16">
        <div data-hero-fade className="mb-8 flex flex-wrap items-center justify-center gap-3">
          {CHIPS.map(({ label, Icon, color }) => (
            <span
              key={label}
              className="flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-1.5 text-sm font-bold shadow-[2px_2px_0_var(--hero-ink)]"
              style={{ color }}
            >
              <Icon className="size-4" strokeWidth={2.5} />
              {label}
            </span>
          ))}
        </div>

        <h1
          data-hero-fade
          className="max-w-5xl font-heading text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl"
        >
          Your personal AI agent
          <br />
          that <EvolvingWord />
        </h1>

        <p
          data-hero-fade
          className="mt-8 max-w-xl text-lg font-medium leading-relaxed text-[var(--hero-ink)]/65 md:text-xl"
        >
          With a wallet, a memory, and hands. Tell Radiant what you want in plain language — it
          does the rest.
        </p>

        <div data-hero-fade className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <a
            href="#"
            className="group flex items-center gap-2 rounded-full bg-[var(--hero-ink)] px-8 py-4 text-base font-bold text-[var(--hero-bg)] shadow-[5px_5px_0_var(--hero-coral)] transition-transform hover:-translate-y-1"
          >
            Try Radiant
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#"
            className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-8 py-4 text-base font-bold shadow-[5px_5px_0_var(--hero-blue)] transition-transform hover:-translate-y-1"
          >
            Browse Explorer
          </a>
        </div>

        {/* command marquee */}
        <div
          data-hero-fade
          className="relative mt-16 w-screen overflow-hidden border-y-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] py-3"
        >
          <div className="hero-marquee flex w-max items-center gap-8 pr-8">
            {[...MARQUEE_COMMANDS, ...MARQUEE_COMMANDS].map((cmd, i) => (
              <span
                key={i}
                className="flex items-center gap-8 whitespace-nowrap text-sm font-bold text-[var(--hero-ink)]"
              >
                &ldquo;{cmd}&rdquo;
                <Sparkles className="size-4" strokeWidth={2.5} />
              </span>
            ))}
          </div>
        </div>

        {/* scroll hint */}
        <div
          data-hero-fade
          className="mb-12 mt-16 flex flex-col items-center gap-3 text-[var(--hero-ink)]/45"
        >
          <span className="text-xs font-bold uppercase tracking-[0.25em]">
            scroll — see what it builds
          </span>
          <span className="hero-scroll-hint flex size-10 items-center justify-center rounded-full border-2 border-[var(--hero-ink)]/30">
            <ArrowDown className="size-4" strokeWidth={2.5} />
          </span>
        </div>
      </main>
    </div>
  );
}

function Decor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {/* amber star, top left */}
      <svg
        className="hero-spin-slow absolute left-[6%] top-[18%] hidden size-14 md:block"
        viewBox="0 0 48 48"
        fill="var(--hero-amber)"
      >
        <path d="M24 0l5.5 18.5L48 24l-18.5 5.5L24 48l-5.5-18.5L0 24l18.5-5.5z" />
      </svg>
      {/* coral ring, right */}
      <div
        className="hero-bob absolute right-[7%] top-[24%] hidden size-16 rounded-full border-[6px] border-[var(--hero-coral)] md:block"
        style={{ "--bob-tilt": "8deg" } as React.CSSProperties}
      />
      {/* mint plus, left lower */}
      <svg
        className="hero-bob absolute left-[10%] top-[58%] hidden size-10 md:block"
        style={{ "--bob-tilt": "-10deg", animationDelay: "1.2s" } as React.CSSProperties}
        viewBox="0 0 40 40"
        fill="var(--hero-mint)"
      >
        <path d="M16 0h8v16h16v8H24v16h-8V24H0v-8h16z" />
      </svg>
      {/* violet squiggle, right lower */}
      <svg
        className="hero-bob absolute right-[9%] top-[60%] hidden w-20 md:block"
        style={{ animationDelay: "0.6s" } as React.CSSProperties}
        viewBox="0 0 80 24"
        fill="none"
        stroke="var(--hero-violet)"
        strokeWidth="6"
        strokeLinecap="round"
      >
        <path d="M3 12c6-12 13 12 19 0s13 12 19 0 13 12 19 0 13 12 17 0" />
      </svg>
      {/* tiny blue dot cluster top-right */}
      <div className="absolute right-[22%] top-[12%] hidden gap-2 md:flex">
        <span className="size-3 rounded-full bg-[var(--hero-blue)]" />
        <span className="size-3 rounded-full bg-[var(--hero-coral)]" />
        <span className="size-3 rounded-full bg-[var(--hero-mint)]" />
      </div>
    </div>
  );
}
