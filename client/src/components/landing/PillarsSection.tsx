"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Coins, Eye, Hand, Sparkles, Workflow } from "lucide-react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const DENIALS = ["a chatbot", "a DeFi app", "a no-code tool"];

const PILLARS = [
  {
    Icon: Hand,
    title: "It acts",
    copy: "Swaps, orders, bridges, flash loans — signed and executed with its own hands. In chat or on the canvas.",
    demo: "“Swap 200 USDC” → done in 4s",
    accent: "var(--hero-coral)",
    tilt: "-rotate-2",
  },
  {
    Icon: Eye,
    title: "It watches",
    copy: "Live feeds, whale wallets, price thresholds. Your workflows react the moment conditions hit — not when you check.",
    demo: "whale moved $1.2M → workflow fired",
    accent: "var(--hero-violet)",
    tilt: "rotate-1",
  },
  {
    Icon: Workflow,
    title: "It automates",
    copy: "Describe a strategy; Radiant wires the node graph, dry-runs it on real data, and runs it live under your caps.",
    demo: "BTC dipped 3% → bought the dip, asleep",
    accent: "var(--hero-mint)",
    tilt: "rotate-2",
  },
  {
    Icon: Coins,
    title: "It earns",
    copy: "List what you build. Anyone — human or agent — uses it, and your fee lands onchain. Automatically.",
    demo: "a stranger used your splitter → +0.2%",
    accent: "var(--hero-amber)",
    tilt: "-rotate-1",
  },
];

const HEADING_WORDS = ["All", "of", "it,", "collapsed", "into"];

const CONFETTI = [
  { className: "left-[8%] top-[14%] size-4 rounded-full bg-[var(--hero-coral)]", speed: 1.4 },
  { className: "right-[12%] top-[10%] size-3 rounded-sm bg-[var(--hero-blue)] rotate-12", speed: 0.9 },
  { className: "left-[16%] top-[68%] size-5 rounded-sm bg-[var(--hero-mint)] -rotate-12", speed: 1.8 },
  { className: "right-[7%] top-[55%] size-4 rounded-full bg-[var(--hero-violet)]", speed: 1.1 },
  { className: "left-[45%] top-[6%] size-3 rounded-full bg-[var(--hero-amber)]", speed: 2 },
  { className: "right-[30%] top-[80%] size-3 rounded-sm bg-[var(--hero-coral)] rotate-45", speed: 1.5 },
];

export function PillarsSection() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // ---- the denials: pills slam in, then get struck out one by one ----
      const denialTl = gsap.timeline({
        scrollTrigger: { trigger: "[data-denials]", start: "top 85%" },
      });
      denialTl.from("[data-denial]", {
        y: 40,
        scale: 0.5,
        opacity: 0,
        rotation: () => gsap.utils.random(-10, 10),
        duration: 0.5,
        stagger: 0.12,
        ease: "back.out(1.8)",
      });
      denialTl.fromTo(
        "[data-strike]",
        { scaleX: 0 },
        { scaleX: 1, duration: 0.28, stagger: 0.22, ease: "power3.in" },
        "+=0.25",
      );
      // each pill sags the moment it's struck
      denialTl.to(
        "[data-denial]",
        {
          rotation: (i) => (i % 2 ? 3 : -3),
          y: 4,
          opacity: 0.5,
          duration: 0.25,
          stagger: 0.22,
          ease: "power2.out",
        },
        "<+0.12",
      );

      // heading words pop up one by one
      gsap.from("[data-hword]", {
        yPercent: 115,
        duration: 0.7,
        stagger: 0.07,
        ease: "power3.out",
        scrollTrigger: { trigger: "[data-pillars-heading]", start: "top 85%" },
      });
      // the "one agent." block snaps in with a bounce
      gsap.from("[data-hl]", {
        scale: 0,
        rotation: -10,
        duration: 0.8,
        ease: "back.out(2.2)",
        scrollTrigger: { trigger: "[data-pillars-heading]", start: "top 80%" },
        delay: 0.4,
      });

      // cards fly in from alternating sides
      gsap.utils.toArray<HTMLElement>("[data-pillar]").forEach((card, i) => {
        gsap.from(card, {
          x: i % 2 === 0 ? -110 : 110,
          rotation: i % 2 === 0 ? -8 : 8,
          opacity: 0,
          duration: 0.9,
          ease: "back.out(1.4)",
          scrollTrigger: { trigger: card, start: "top 88%" },
        });
      });

      // icon badges spin-pop in after their cards land
      gsap.from("[data-pillar-icon]", {
        scale: 0,
        rotation: -200,
        duration: 0.75,
        stagger: 0.12,
        ease: "back.out(2)",
        scrollTrigger: { trigger: "[data-pillar-grid]", start: "top 75%" },
      });

      // giant verb strip scrubs sideways with scroll
      gsap.fromTo(
        "[data-strip]",
        { xPercent: 0 },
        {
          xPercent: -30,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        },
      );

      // confetti drifts up at different speeds (parallax)
      gsap.utils.toArray<HTMLElement>("[data-confetti]").forEach((el) => {
        gsap.to(el, {
          y: -120 * Number(el.dataset.confetti || 1),
          rotation: 120,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      // ---- cards lean toward the cursor in 3D ----
      if (!window.matchMedia("(pointer: fine)").matches) return;
      const cleanups: (() => void)[] = [];
      gsap.utils.toArray<HTMLElement>("[data-pillar]").forEach((card) => {
        const rx = gsap.quickTo(card, "rotationX", { duration: 0.45, ease: "power3" });
        const ry = gsap.quickTo(card, "rotationY", { duration: 0.45, ease: "power3" });
        const move = (e: PointerEvent) => {
          const r = card.getBoundingClientRect();
          rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
          ry(((e.clientX - r.left) / r.width - 0.5) * 10);
        };
        const leave = () => {
          rx(0);
          ry(0);
        };
        card.addEventListener("pointermove", move, { passive: true });
        card.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          card.removeEventListener("pointermove", move);
          card.removeEventListener("pointerleave", leave);
        });
      });
      return () => cleanups.forEach((fn) => fn());
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-bg)] px-6 py-28 text-[var(--hero-ink)] md:py-40"
    >
      {/* parallax confetti */}
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          data-confetti={c.speed}
          aria-hidden
          className={`pointer-events-none absolute ${c.className}`}
        />
      ))}

      {/* giant scrubbed verb strip behind everything */}
      <div
        data-strip
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 select-none whitespace-nowrap font-heading text-[16vw] font-extrabold leading-none text-[var(--hero-ink)]/4"
      >
        ACTS · WATCHES · AUTOMATES · EARNS · ACTS · WATCHES · AUTOMATES · EARNS ·
      </div>

      <div className="relative mx-auto max-w-6xl">
        {/* what radiant is not — struck out, live */}
        <div data-denials className="mb-10 flex flex-col items-center gap-4">
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/40">
            radiant is not
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {DENIALS.map((label) => (
              <span
                key={label}
                data-denial
                className="relative rounded-full border-2 border-[var(--hero-ink)] bg-white px-5 py-2 font-heading text-lg font-extrabold shadow-[3px_3px_0_var(--hero-ink)] md:text-xl"
              >
                {label}
                <span
                  data-strike
                  aria-hidden
                  className="absolute left-2 right-2 top-1/2 h-[3.5px] origin-left -rotate-3 rounded-full bg-[var(--hero-coral)]"
                />
              </span>
            ))}
          </div>
        </div>

        <h2
          data-pillars-heading
          className="mx-auto max-w-4xl text-center font-heading text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl md:text-6xl"
        >
          {HEADING_WORDS.map((word, i) => (
            <span key={i} className="inline-block overflow-hidden pb-1 align-top">
              <span data-hword className="inline-block">
                {word}
                {" "}
              </span>
            </span>
          ))}
          <span
            data-hl
            className="inline-block -rotate-2 rounded-2xl bg-[var(--hero-amber)] px-4 pb-1 align-top shadow-[4px_4px_0_var(--hero-ink)]"
          >
            one agent.
          </span>
        </h2>

        <div
          data-pillar-grid
          className="mt-20 grid gap-8 sm:grid-cols-2"
          style={{ perspective: "1200px" }}
        >
          {PILLARS.map(({ Icon, title, copy, demo, accent, tilt }) => (
            <div
              key={title}
              data-pillar
              className={`group rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-8 shadow-[6px_6px_0_var(--hero-ink)] transition-shadow duration-300 will-change-transform hover:shadow-[10px_10px_0_var(--hero-ink)] md:p-10 ${tilt}`}
            >
              <span
                data-pillar-icon
                className="hero-wiggle mb-6 flex size-14 items-center justify-center rounded-2xl border-2 border-[var(--hero-ink)] text-white transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110"
                style={{ backgroundColor: accent }}
              >
                <Icon className="size-7" strokeWidth={2.4} />
              </span>
              <h3 className="font-heading text-3xl font-extrabold tracking-tight">{title}</h3>
              <p className="mt-4 text-base font-medium leading-relaxed text-[var(--hero-ink)]/65">
                {copy}
              </p>

              {/* proof line — slides up when you lean in */}
              <div className="mt-6 overflow-hidden">
                <span
                  className="flex translate-y-8 items-center gap-2 text-sm font-bold opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                  style={{ color: accent }}
                >
                  <Sparkles className="size-4 shrink-0" strokeWidth={2.5} />
                  {demo}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
