"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { WordReveal } from "./WordReveal";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function FooterSection() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.to("[data-giant]", {
        xPercent: -12,
        ease: "none",
        scrollTrigger: {
          trigger: ref.current,
          start: "top bottom",
          end: "bottom bottom",
          scrub: true,
        },
      });
    },
    { scope: ref },
  );

  return (
    <footer
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-ink)] px-6 pt-28 text-[var(--hero-bg)] md:pt-40"
    >
      <div className="mx-auto max-w-4xl text-center">
        <WordReveal
          text="Stop doing it manually."
          className="font-heading text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl"
        />
        <p className="mx-auto mt-6 max-w-lg text-base font-medium leading-relaxed text-[var(--hero-bg)]/55 md:text-lg">
          Get an agent with a wallet, a memory, and hands. The first thing it builds you is free
          time.
        </p>
        <div className="mt-10 flex justify-center">
          <a
            href="#"
            className="group flex items-center gap-2 rounded-full bg-[var(--hero-amber)] px-9 py-4 text-base font-bold text-[var(--hero-ink)] shadow-[5px_5px_0_var(--hero-coral)] transition-transform hover:-translate-y-1"
          >
            Try Radiant
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </div>

      <div className="mx-auto mt-20 flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-[var(--hero-bg)]/15 pt-8 text-sm font-semibold text-[var(--hero-bg)]/50">
        <a href="#" className="transition-colors hover:text-[var(--hero-amber)]">
          Explorer
        </a>
        <a href="#" className="transition-colors hover:text-[var(--hero-amber)]">
          Docs
        </a>
        <a href="#" className="transition-colors hover:text-[var(--hero-amber)]">
          GitHub
        </a>
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--hero-amber)]" strokeWidth={2.5} />
          Built on Sui · Stored on Walrus
        </span>
      </div>

      <div
        data-giant
        aria-hidden
        className="text-outline-cream pointer-events-none mt-10 select-none whitespace-nowrap font-heading text-[22vw] font-extrabold leading-[0.8] tracking-tight"
      >
        RADIANT RADIANT
      </div>
    </footer>
  );
}
