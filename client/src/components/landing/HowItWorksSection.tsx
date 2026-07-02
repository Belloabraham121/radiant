"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Check, MessageCircle, Workflow } from "lucide-react";
import { WordReveal } from "./WordReveal";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function HowItWorksSection() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // phase headers slide in
      gsap.utils.toArray<HTMLElement>("[data-phase-head]").forEach((head) => {
        gsap.from(head, {
          x: -60,
          opacity: 0,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: head, start: "top 82%" },
        });
      });

      // each step reveals as you scroll to it: number pops, card slides,
      // then its little demo plays
      gsap.utils.toArray<HTMLElement>("[data-hiw-step]").forEach((step) => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: step, start: "top 78%" },
        });
        tl.from(step.querySelector("[data-hiw-n]"), {
          scale: 0,
          rotation: -18,
          duration: 0.45,
          ease: "back.out(2.2)",
        });
        tl.from(
          step.querySelector("[data-hiw-card]"),
          { x: 64, autoAlpha: 0, duration: 0.5, ease: "power3.out" },
          "-=0.2",
        );
        const pops = step.querySelectorAll("[data-pop]");
        if (pops.length) {
          tl.fromTo(
            pops,
            { y: 14, scale: 0.85, autoAlpha: 0 },
            { y: 0, scale: 1, autoAlpha: 1, duration: 0.35, stagger: 0.16, ease: "back.out(1.7)" },
            "-=0.1",
          );
        }
        const wires = step.querySelectorAll("[data-wire]");
        if (wires.length) {
          tl.fromTo(
            wires,
            { scaleX: 0 },
            { scaleX: 1, duration: 0.28, stagger: 0.18, transformOrigin: "left center" },
            "<+0.2",
          );
        }
      });

      // the rail draws itself as you scroll through each phase
      gsap.utils.toArray<HTMLElement>("[data-phase]").forEach((phase) => {
        const rail = phase.querySelector("[data-rail]");
        if (!rail) return;
        gsap.fromTo(
          rail,
          { scaleY: 0 },
          {
            scaleY: 1,
            transformOrigin: "top center",
            ease: "none",
            scrollTrigger: {
              trigger: phase,
              start: "top 62%",
              end: "bottom 75%",
              scrub: 0.4,
            },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-ink)] px-6 py-28 text-[var(--hero-bg)] md:py-40"
    >
      <div className="mx-auto max-w-4xl">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-bg)]/40">
          How it works
        </p>
        <WordReveal
          text="You describe. It runs."
          className="mx-auto max-w-3xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
        />
        <p className="mx-auto mt-6 max-w-xl text-center text-base font-medium leading-relaxed text-[var(--hero-bg)]/55 md:text-lg">
          Two doors, three steps each. Chat gets it done in a sentence — Canvas keeps it running
          forever.
        </p>

        {/* ================= PHASE 1 — IN CHAT ================= */}
        <div data-phase className="relative mt-24">
          <div data-phase-head className="mb-12 flex items-center gap-4">
            <span className="flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-[2px_2px_0_rgba(0,0,0,0.4)]">
              <MessageCircle className="size-3.5" strokeWidth={2.5} />
              in chat
            </span>
            <h3 className="font-heading text-2xl font-extrabold tracking-tight md:text-3xl">
              One-off actions
            </h3>
          </div>

          {/* rail */}
          <div className="absolute bottom-8 left-[23px] top-24 hidden w-[3px] rounded bg-[var(--hero-bg)]/10 sm:block">
            <div data-rail className="h-full w-full rounded bg-[var(--hero-coral)]" />
          </div>

          <div className="flex flex-col gap-12">
            {/* step 1 */}
            <div data-hiw-step className="relative flex gap-5 md:gap-8">
              <span
                data-hiw-n
                className="z-10 hidden size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)] font-heading text-lg font-extrabold text-white shadow-[3px_3px_0_rgba(0,0,0,0.4)] sm:flex"
              >
                1
              </span>
              <div
                data-hiw-card
                className="flex-1 rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-6 md:p-8"
              >
                <h4 className="font-heading text-xl font-extrabold tracking-tight">Say it</h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--hero-bg)]/60">
                  One sentence, plain language. No wallet popups, no contract addresses, no tabs.
                </p>
                <div className="mt-5 flex flex-col rounded-2xl border-2 border-[var(--hero-bg)]/10 p-4">
                  <span
                    data-pop
                    className="self-end rounded-2xl rounded-br-sm bg-[var(--hero-amber)] px-4 py-2.5 text-sm font-bold text-[var(--hero-ink)]"
                  >
                    Swap 200 USDC for SUI — best rate.
                  </span>
                </div>
              </div>
            </div>

            {/* step 2 */}
            <div data-hiw-step className="relative flex gap-5 md:gap-8">
              <span
                data-hiw-n
                className="z-10 hidden size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)] font-heading text-lg font-extrabold text-white shadow-[3px_3px_0_rgba(0,0,0,0.4)] sm:flex"
              >
                2
              </span>
              <div
                data-hiw-card
                className="flex-1 rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-6 md:p-8"
              >
                <h4 className="font-heading text-xl font-extrabold tracking-tight">It executes</h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--hero-bg)]/60">
                  Routes for the best price, signs with its own wallet, submits — hands, not
                  suggestions.
                </p>
                <div className="mt-5 flex flex-col gap-2.5 rounded-2xl border-2 border-[var(--hero-bg)]/10 p-4">
                  {[
                    { text: "Best route found", via: "DeepBook" },
                    { text: "Signed with your agent wallet" },
                    { text: "Submitted — filled at 3.42" },
                  ].map((row, i) => (
                    <span key={i} data-pop className="flex items-center gap-2.5 text-sm font-bold text-[var(--hero-bg)]/80">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--hero-mint)]">
                        <Check className="size-3 text-white" strokeWidth={4} />
                      </span>
                      {row.text}
                      {row.via && (
                        <span className="rounded-full border border-[var(--hero-bg)]/20 px-2 py-0.5 text-[11px] font-extrabold text-[var(--hero-blue)]">
                          {row.via}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* step 3 */}
            <div data-hiw-step className="relative flex gap-5 md:gap-8">
              <span
                data-hiw-n
                className="z-10 hidden size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)] font-heading text-lg font-extrabold text-white shadow-[3px_3px_0_rgba(0,0,0,0.4)] sm:flex"
              >
                3
              </span>
              <div
                data-hiw-card
                className="flex-1 rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-6 md:p-8"
              >
                <h4 className="font-heading text-xl font-extrabold tracking-tight">
                  Done — and remembered
                </h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--hero-bg)]/60">
                  Receipt in the thread. And the agent remembers the route, the token, the
                  preference — you never repeat yourself.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[var(--hero-bg)]/10 p-4">
                  <span
                    data-pop
                    className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-[var(--hero-bg)] px-4 py-2.5 text-sm font-bold text-[var(--hero-ink)]"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--hero-mint)]">
                      <Check className="size-3 text-white" strokeWidth={3.5} />
                    </span>
                    Done — 58.4 SUI in your wallet.
                  </span>
                  <span
                    data-pop
                    className="rounded-full border-2 border-[var(--hero-violet)]/60 px-3 py-1.5 text-xs font-extrabold text-[var(--hero-violet)]"
                  >
                    remembered: best route = DeepBook
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= PHASE 2 — ON CANVAS ================= */}
        <div data-phase className="relative mt-28">
          <div data-phase-head className="mb-12 flex items-center gap-4">
            <span className="flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-[2px_2px_0_rgba(0,0,0,0.4)]">
              <Workflow className="size-3.5" strokeWidth={2.5} />
              on canvas
            </span>
            <h3 className="font-heading text-2xl font-extrabold tracking-tight md:text-3xl">
              Strategies that keep running
            </h3>
          </div>

          {/* rail */}
          <div className="absolute bottom-8 left-[23px] top-24 hidden w-[3px] rounded bg-[var(--hero-bg)]/10 sm:block">
            <div data-rail className="h-full w-full rounded bg-[var(--hero-mint)]" />
          </div>

          <div className="flex flex-col gap-12">
            {/* step 1 */}
            <div data-hiw-step className="relative flex gap-5 md:gap-8">
              <span
                data-hiw-n
                className="z-10 hidden size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] font-heading text-lg font-extrabold text-white shadow-[3px_3px_0_rgba(0,0,0,0.4)] sm:flex"
              >
                1
              </span>
              <div
                data-hiw-card
                className="flex-1 rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-6 md:p-8"
              >
                <h4 className="font-heading text-xl font-extrabold tracking-tight">
                  Describe the strategy
                </h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--hero-bg)]/60">
                  Not a one-off this time — a rule you want working for you around the clock.
                </p>
                <div className="mt-5 flex flex-col rounded-2xl border-2 border-[var(--hero-bg)]/10 p-4">
                  <span
                    data-pop
                    className="self-end rounded-2xl rounded-br-sm bg-[var(--hero-amber)] px-4 py-2.5 text-sm font-bold text-[var(--hero-ink)]"
                  >
                    Buy every BTC dip over 3%. Cap it at $200 a day.
                  </span>
                </div>
              </div>
            </div>

            {/* step 2 */}
            <div data-hiw-step className="relative flex gap-5 md:gap-8">
              <span
                data-hiw-n
                className="z-10 hidden size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] font-heading text-lg font-extrabold text-white shadow-[3px_3px_0_rgba(0,0,0,0.4)] sm:flex"
              >
                2
              </span>
              <div
                data-hiw-card
                className="flex-1 rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-6 md:p-8"
              >
                <h4 className="font-heading text-xl font-extrabold tracking-tight">
                  Builder wires it, Tester dry-runs it
                </h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--hero-bg)]/60">
                  The Builder agent assembles the node graph; the Tester runs it against live
                  market data. No money moves yet.
                </p>
                <div className="mt-5 rounded-2xl border-2 border-[var(--hero-bg)]/10 p-4">
                  <div className="flex flex-wrap items-center gap-y-3">
                    {[
                      { label: "Price Feed", color: "var(--hero-blue)" },
                      { label: "Threshold −3%", color: "var(--hero-amber)" },
                      { label: "Market Buy", color: "var(--hero-coral)" },
                    ].map((node, i) => (
                      <span key={node.label} className="flex items-center">
                        {i > 0 && (
                          <span
                            data-wire
                            className="h-[3px] w-5 shrink-0 rounded bg-[var(--hero-bg)]/30 sm:w-8"
                          />
                        )}
                        <span
                          data-pop
                          className="rounded-xl border-2 border-[var(--hero-ink)] px-3 py-2 text-xs font-extrabold text-white shadow-[2px_2px_0_rgba(0,0,0,0.4)]"
                          style={{ backgroundColor: node.color }}
                        >
                          {node.label}
                        </span>
                      </span>
                    ))}
                    <span
                      data-pop
                      className="ml-4 flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-mint)]/70 px-3 py-1.5 text-xs font-extrabold text-[var(--hero-mint)]"
                    >
                      <Check className="size-3.5" strokeWidth={3.5} />
                      dry-run passed on live data
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* step 3 */}
            <div data-hiw-step className="relative flex gap-5 md:gap-8">
              <span
                data-hiw-n
                className="z-10 hidden size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] font-heading text-lg font-extrabold text-white shadow-[3px_3px_0_rgba(0,0,0,0.4)] sm:flex"
              >
                3
              </span>
              <div
                data-hiw-card
                className="flex-1 rounded-3xl border-2 border-[var(--hero-bg)]/20 bg-[var(--hero-bg)]/5 p-6 md:p-8"
              >
                <h4 className="font-heading text-xl font-extrabold tracking-tight">Flip it Live</h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--hero-bg)]/60">
                  Policy caps every order, big moves still come to you for approval — and it runs
                  while you sleep.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[var(--hero-bg)]/10 p-4">
                  <span
                    data-pop
                    className="flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-4 py-2 text-sm font-extrabold text-white"
                  >
                    <span className="hero-pulse-ring size-2 rounded-full bg-white" />
                    LIVE
                  </span>
                  <span
                    data-pop
                    className="rounded-full border-2 border-[var(--hero-bg)]/20 px-3 py-1.5 text-xs font-extrabold text-[var(--hero-bg)]/70"
                  >
                    policy: $200 / day cap
                  </span>
                  <span
                    data-pop
                    className="rounded-full border-2 border-[var(--hero-bg)]/20 px-3 py-1.5 text-xs font-extrabold text-[var(--hero-bg)]/70"
                  >
                    big moves → you approve
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
