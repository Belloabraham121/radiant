"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { useGSAP } from "@gsap/react";
import {
  Bell,
  FlaskConical,
  Gauge,
  Radar,
  ShieldCheck,
  ShoppingCart,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { RadiantBuddy } from "./RadiantBuddy";
import { WordReveal } from "./WordReveal";

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin, useGSAP);

/* Board is a fixed 960×520 coordinate space (scrolls horizontally on small
   screens) so the SVG edges and the HTML node cards share exact positions. */
const CARD_W = 168;
const CARD_H = 100;

type BoardNode = {
  id: string;
  title: string;
  sub: string;
  x: number;
  y: number;
  color: string;
  Icon?: LucideIcon;
  buddy?: boolean;
};

const NODES: BoardNode[] = [
  { id: "whale", title: "Whale Tracker", sub: "watching 0x8a…41", x: 12, y: 210, color: "var(--hero-blue)", Icon: Waves },
  { id: "threshold", title: "Threshold", sub: "fires above $1M", x: 204, y: 60, color: "var(--hero-amber)", Icon: Gauge },
  { id: "ai", title: "AI Reason", sub: "worth copying?", x: 396, y: 220, color: "var(--hero-violet)", buddy: true },
  { id: "policy", title: "Policy Gate", sub: "cap $200 / day", x: 588, y: 60, color: "var(--hero-mint)", Icon: ShieldCheck },
  { id: "order", title: "Place Order", sub: "DeepBook · market", x: 780, y: 200, color: "var(--hero-coral)", Icon: ShoppingCart },
  { id: "notify", title: "Notify", sub: "ping me on fills", x: 780, y: 390, color: "var(--hero-blue)", Icon: Bell },
];

/* right-center → left-center bezier between consecutive nodes; last edge
   drops from Place Order's bottom into Notify's top */
const EDGES = [
  "M180 260 C 240 260 144 110 204 110",
  "M372 110 C 432 110 336 270 396 270",
  "M564 270 C 624 270 528 110 588 110",
  "M756 110 C 816 110 720 250 780 250",
  "M864 300 C 864 330 864 356 864 390",
];

const FEATURES = [
  { Icon: FlaskConical, label: "Dry-run on real market data", color: "var(--hero-amber)" },
  { Icon: ShieldCheck, label: "Policy caps every live order", color: "var(--hero-mint)" },
  { Icon: Radar, label: "Live monitor charts built in", color: "var(--hero-blue)" },
];

const WORKFLOWS = [
  { name: "BTC dip buyer", status: "live" },
  { name: "Whale copy trade", status: "live" },
  { name: "ETH limit ladder", status: "dry-run" },
  { name: "Sui weekly rebalance", status: "draft" },
] as const;

const STATUS_COLOR: Record<(typeof WORKFLOWS)[number]["status"], string> = {
  live: "var(--hero-mint)",
  "dry-run": "var(--hero-amber)",
  draft: "rgba(250,246,236,0.35)",
};

export function CanvasShowcaseSection() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // ---- entrance: nodes pop in, edges fade up ----
      gsap.from("[data-node]", {
        scale: 0,
        rotation: () => gsap.utils.random(-14, 14),
        duration: 0.6,
        stagger: 0.1,
        ease: "back.out(1.9)",
        scrollTrigger: { trigger: "[data-board]", start: "top 75%" },
      });
      gsap.from("[data-edge]", {
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        delay: 0.35,
        scrollTrigger: { trigger: "[data-board]", start: "top 75%" },
      });

      // ---- edges flow forever ----
      gsap.to("[data-edge]", {
        strokeDashoffset: -28,
        repeat: -1,
        duration: 1.1,
        ease: "none",
      });

      // ---- the run loop: each node fires, a pulse rides the wire ----
      const nodes = gsap.utils.toArray<HTMLElement>("[data-node]");
      const edges = gsap.utils.toArray<SVGPathElement>("[data-edge]");
      const pulse = ref.current?.querySelector("[data-pulse]");
      if (!pulse || nodes.length === 0) return;

      const run = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.9,
        paused: true,
      });

      nodes.forEach((node, i) => {
        run.to(node, { scale: 1.07, y: -4, duration: 0.22, ease: "back.out(2.5)" });
        run.to(node, { scale: 1, y: 0, duration: 0.3, ease: "power2.out" }, "+=0.12");
        const edge = edges[i];
        if (edge) {
          run.set(pulse, { opacity: 1 }, "<");
          run.to(
            pulse,
            {
              motionPath: { path: edge, align: edge, alignOrigin: [0.5, 0.5] },
              duration: 0.7,
              ease: "power1.inOut",
            },
            "<",
          );
          run.set(pulse, { opacity: 0 });
        }
      });

      ScrollTrigger.create({
        trigger: "[data-board]",
        start: "top 70%",
        onEnter: () => run.play(),
        onLeave: () => run.pause(),
        onEnterBack: () => run.play(),
        onLeaveBack: () => run.pause(),
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-ink)] px-6 py-28 text-[var(--hero-bg)] md:py-36"
    >
      <div className="mx-auto max-w-6xl">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-bg)]/40">
          The canvas
        </p>
        <WordReveal
          text="Describe it. Watch it wire itself."
          className="mx-auto max-w-3xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
        />
        <p className="mx-auto mt-6 max-w-xl text-center text-base font-medium leading-relaxed text-[var(--hero-bg)]/55 md:text-lg">
          &ldquo;Copy every whale over $1M — under my cap.&rdquo; The Builder agent assembles the
          graph. You dry-run it. Then you flip it Live.
        </p>

        {/* feature chips */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {FEATURES.map(({ Icon, label, color }) => (
            <span
              key={label}
              className="flex items-center gap-2 rounded-full border-2 border-[var(--hero-bg)]/25 bg-[var(--hero-bg)]/5 px-4 py-1.5 text-sm font-bold"
              style={{ color }}
            >
              <Icon className="size-4" strokeWidth={2.5} />
              <span className="text-[var(--hero-bg)]/85">{label}</span>
            </span>
          ))}
        </div>

        {/* the board */}
        <div className="mt-12 overflow-x-auto rounded-3xl border-2 border-[var(--hero-bg)]/20">
          <div
            data-board
            className="relative mx-auto h-[520px] w-[960px] shrink-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(250,246,236,0.13) 1.5px, transparent 1.5px)",
              backgroundSize: "26px 26px",
            }}
          >
            {/* edges */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 960 520"
              fill="none"
              aria-hidden
            >
              {EDGES.map((d, i) => (
                <path
                  key={i}
                  data-edge
                  d={d}
                  stroke="rgba(250,246,236,0.35)"
                  strokeWidth="2.5"
                  strokeDasharray="7 7"
                  strokeLinecap="round"
                />
              ))}
              <circle data-pulse r="6" fill="var(--hero-amber)" opacity="0" />
            </svg>

            {/* nodes */}
            {NODES.map(({ id, title, sub, x, y, color, Icon, buddy }) => (
              <div
                key={id}
                data-node
                className="absolute flex items-center gap-3 rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-3 text-[var(--hero-ink)] will-change-transform"
                style={{
                  left: x,
                  top: y,
                  width: CARD_W,
                  height: CARD_H,
                  boxShadow: `4px 4px 0 ${color}`,
                }}
              >
                {buddy ? (
                  <RadiantBuddy size={56} color={color} antenna="var(--hero-amber)" eyeRange={3.5} />
                ) : (
                  Icon && (
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] text-white"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="size-5" strokeWidth={2.4} />
                    </span>
                  )
                )}
                <span className="min-w-0">
                  <span className="block truncate font-heading text-sm font-extrabold leading-tight">
                    {title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--hero-ink)]/55">
                    {sub}
                  </span>
                </span>
                {/* ports */}
                <span
                  className="absolute -left-[5px] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-[var(--hero-ink)] bg-white"
                  aria-hidden
                />
                <span
                  className="absolute -right-[5px] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-[var(--hero-ink)]"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
              </div>
            ))}
          </div>
        </div>

        {/* workflow shelf */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {WORKFLOWS.map(({ name, status }) => (
            <span
              key={name}
              className="flex items-center gap-2.5 rounded-full border-2 border-[var(--hero-bg)]/25 bg-[var(--hero-bg)]/5 px-4 py-2 text-sm font-bold text-[var(--hero-bg)]/85 transition-colors hover:border-[var(--hero-bg)]/50"
            >
              <span
                className={status === "live" ? "hero-pulse-ring size-2 rounded-full" : "size-2 rounded-full"}
                style={{ backgroundColor: STATUS_COLOR[status] }}
              />
              {name}
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--hero-bg)]/40">
                {status}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
