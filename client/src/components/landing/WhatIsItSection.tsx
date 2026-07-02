"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  Activity,
  Check,
  Gauge,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Waves,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { RadiantBuddy } from "./RadiantBuddy";
import { useReducedMotion } from "./useReducedMotion";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ------------------------- front face: chat executions ------------------------- */

type Scenario = {
  cmd: string;
  steps: { text: string; via?: string; viaColor?: string }[];
  result: string;
};

const SCENARIOS: Scenario[] = [
  {
    cmd: "Pay Alex 5 SUI.",
    steps: [{ text: "Resolved Alex → 0x4f…2a" }, { text: "Signed & sent" }],
    result: "Done.",
  },
  {
    cmd: "Swap 200 USDC for SUI — best rate.",
    steps: [
      { text: "Best route found", via: "DeepBook", viaColor: "var(--hero-blue)" },
      { text: "Signed with your agent wallet" },
      { text: "Filled at 3.42 USDC / SUI" },
    ],
    result: "Done — 58.4 SUI in your wallet.",
  },
  {
    cmd: "Bridge 500 USDC to Base.",
    steps: [
      { text: "Route locked", via: "Li-Fi", viaColor: "var(--hero-violet)" },
      { text: "Bridging — tracking in flight" },
      { text: "Landed on Base" },
    ],
    result: "Done — 499.6 USDC on Base.",
  },
  {
    cmd: "Run the SUI/USDC flash-loan round trip.",
    steps: [
      { text: "Borrow 10,000 SUI", via: "DeepBook", viaColor: "var(--hero-blue)" },
      { text: "Swap chain → repay, atomically" },
      { text: "Profit check: repay feasible ✓" },
    ],
    result: "Done — +42 USDC. Zero capital down.",
  },
];

/* ------------------------- back face: canvas builds ------------------------- */

type BuildNode = { title: string; sub: string; color: string; Icon: LucideIcon };

const BUILDS: { name: string; nodes: BuildNode[] }[] = [
  {
    name: "BTC dip buyer",
    nodes: [
      { title: "Price Feed", sub: "BTC / USDC", color: "var(--hero-blue)", Icon: Activity },
      { title: "Threshold", sub: "drops 3% in 1h", color: "var(--hero-amber)", Icon: Gauge },
      { title: "Policy Gate", sub: "cap $200 / day", color: "var(--hero-mint)", Icon: ShieldCheck },
      { title: "Market Buy", sub: "DeepBook", color: "var(--hero-coral)", Icon: ShoppingCart },
    ],
  },
  {
    name: "Whale copy trade",
    nodes: [
      { title: "Whale Tracker", sub: "watching 0x8a…41", color: "var(--hero-blue)", Icon: Waves },
      { title: "AI Reason", sub: "worth copying?", color: "var(--hero-violet)", Icon: Sparkles },
      { title: "Policy Gate", sub: "cap $500 / trade", color: "var(--hero-mint)", Icon: ShieldCheck },
      { title: "Copy Trade", sub: "mirror the entry", color: "var(--hero-coral)", Icon: ShoppingCart },
    ],
  },
];

/* board space 640 × 440, cards 150 × 64 */
const NODE_POS = [
  { x: 16, y: 280 },
  { x: 180, y: 84 },
  { x: 330, y: 292 },
  { x: 478, y: 100 },
];

const BUILD_EDGES = [
  "M166 312 C 220 312 126 116 180 116",
  "M330 116 C 384 116 276 324 330 324",
  "M480 324 C 534 324 424 132 478 132",
];

type Side = "chat" | "canvas";

export function WhatIsItSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [side, setSide] = useState<Side>("chat");
  const sideRef = useRef<Side>("chat");
  const autoRef = useRef<gsap.core.Tween | null>(null);
  const flipRef = useRef<((next: Side, manual: boolean) => void) | null>(null);

  useGSAP(
    () => {
      const root = ref.current!;
      const flipper = root.querySelector("[data-flipper]");
      if (!flipper) return;

      // ---- flip logic lives inside the gsap context ----
      const doFlip = (next: Side, manual: boolean) => {
        if (sideRef.current === next) return;
        sideRef.current = next;
        setSide(next);
        const rotY = next === "canvas" ? 180 : 0;
        if (reduced) {
          gsap.set(flipper, { rotationY: rotY });
          return;
        }
        gsap.to(flipper, { rotationY: rotY, duration: 1, ease: "back.inOut(1.2)" });
        // the buddy backflips whenever the panel flips
        const buddy = root.querySelector("[data-panel-buddy]");
        if (buddy) {
          gsap.fromTo(
            buddy,
            { y: 0, rotation: 0 },
            {
              keyframes: [
                {
                  y: -46,
                  rotation: next === "canvas" ? 360 : -360,
                  duration: 0.55,
                  ease: "power2.out",
                },
                { y: 0, duration: 0.45, ease: "bounce.out" },
              ],
            },
          );
        }
        if (manual) autoRef.current?.kill(); // you took the wheel — stop auto-flipping
      };
      flipRef.current = doFlip;

      const scheduleAutoFlip = () => {
        autoRef.current?.kill();
        autoRef.current = gsap.delayedCall(9, () => {
          doFlip(sideRef.current === "chat" ? "canvas" : "chat", false);
          scheduleAutoFlip();
        });
      };

      if (reduced) return;

      // ---- entrance ----
      gsap.from("[data-stage]", {
        y: 90,
        scale: 0.88,
        opacity: 0,
        duration: 1,
        ease: "back.out(1.4)",
        scrollTrigger: { trigger: root, start: "top 70%" },
      });

      // ---- levitation: panel bobs, ground shadow breathes ----
      gsap.to("[data-float]", {
        y: -12,
        duration: 2.6,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
      gsap.to("[data-ground]", {
        scaleX: 0.82,
        opacity: 0.55,
        duration: 2.6,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });

      // ---- 3D tilt toward the cursor ----
      const cleanups: (() => void)[] = [];
      if (window.matchMedia("(pointer: fine)").matches) {
        const stage = root.querySelector<HTMLElement>("[data-stage]")!;
        const tilt = root.querySelector("[data-tilt]");
        const rx = gsap.quickTo(tilt, "rotationX", { duration: 0.7, ease: "power3" });
        const ry = gsap.quickTo(tilt, "rotationY", { duration: 0.7, ease: "power3" });
        const move = (e: PointerEvent) => {
          const r = stage.getBoundingClientRect();
          const nx = gsap.utils.clamp(-0.75, 0.75, (e.clientX - (r.left + r.width / 2)) / r.width);
          const ny = gsap.utils.clamp(-0.75, 0.75, (e.clientY - (r.top + r.height / 2)) / r.height);
          rx(-ny * 12);
          ry(nx * 14);
        };
        window.addEventListener("pointermove", move, { passive: true });

        // decor floaters drift at their own depth
        const layers = gsap.utils.toArray<HTMLElement>("[data-orbit]", root).map((el) => ({
          depth: Number(el.dataset.orbit || 1),
          x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3" }),
          y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3" }),
        }));
        const drift = (e: PointerEvent) => {
          const nx = e.clientX / window.innerWidth - 0.5;
          const ny = e.clientY / window.innerHeight - 0.5;
          layers.forEach((l) => {
            l.x(nx * l.depth * 40);
            l.y(ny * l.depth * 30);
          });
        };
        window.addEventListener("pointermove", drift, { passive: true });

        cleanups.push(() => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointermove", drift);
        });
      }

      // ---- chat loop: executions type & run forever ----
      const scenarios = gsap.utils.toArray<HTMLElement>("[data-sc]", root);
      gsap.set(scenarios, { autoAlpha: 0 });
      const chatTl = gsap.timeline({ repeat: -1, repeatDelay: 0.4, paused: true });

      scenarios.forEach((sc, i) => {
        const cmdEl = sc.querySelector<HTMLElement>("[data-cmd]");
        const user = sc.querySelector("[data-user]");
        const steps = Array.from(sc.querySelectorAll<HTMLElement>("[data-step]"));
        const result = sc.querySelector("[data-result]");
        const cmd = SCENARIOS[i].cmd;

        chatTl.set(sc, { autoAlpha: 1 });
        chatTl.fromTo(
          user,
          { y: 16, scale: 0.85, autoAlpha: 0 },
          { y: 0, scale: 1, autoAlpha: 1, duration: 0.35, ease: "back.out(1.8)" },
        );
        // typewriter
        const proxy = { n: 0 };
        chatTl.fromTo(
          proxy,
          { n: 0 },
          {
            n: cmd.length,
            duration: Math.min(1.1, cmd.length * 0.028),
            ease: "none",
            onUpdate() {
              if (cmdEl) cmdEl.textContent = cmd.slice(0, Math.round(proxy.n));
            },
          },
        );
        steps.forEach((step) => {
          const dot = step.querySelector("[data-dot]");
          const check = step.querySelector("[data-check]");
          chatTl.fromTo(
            step,
            { x: -16, autoAlpha: 0 },
            { x: 0, autoAlpha: 1, duration: 0.28 },
            "+=0.22",
          );
          chatTl.fromTo(
            dot,
            { backgroundColor: "#ffffff" },
            { backgroundColor: "#00c478", duration: 0.18 },
            "+=0.28",
          );
          chatTl.fromTo(check, { scale: 0 }, { scale: 1, duration: 0.25, ease: "back.out(2.4)" }, "<");
        });
        chatTl.fromTo(
          result,
          { y: 14, scale: 0.9, autoAlpha: 0 },
          { y: 0, scale: 1, autoAlpha: 1, duration: 0.35, ease: "back.out(1.8)" },
          "+=0.2",
        );
        chatTl.to(sc, { autoAlpha: 0, duration: 0.3 }, "+=1.6");
      });

      // ---- canvas loop: workflows assemble forever ----
      const builds = gsap.utils.toArray<HTMLElement>("[data-build]", root);
      gsap.set(builds, { autoAlpha: 0 });
      const buildTl = gsap.timeline({ repeat: -1, repeatDelay: 0.4, paused: true });

      builds.forEach((build) => {
        const chip = build.querySelector("[data-build-chip]");
        const nodes = Array.from(build.querySelectorAll<HTMLElement>("[data-build-node]"));
        const edges = Array.from(build.querySelectorAll<SVGPathElement>("[data-build-edge]"));
        const badge = build.querySelector("[data-build-badge]");

        buildTl.set(build, { autoAlpha: 1 });
        buildTl.fromTo(
          chip,
          { scale: 0, rotation: -8 },
          { scale: 1, rotation: 0, duration: 0.3, ease: "back.out(2)" },
        );
        nodes.forEach((node, j) => {
          buildTl.fromTo(
            node,
            { scale: 0, rotation: j % 2 ? 10 : -10 },
            { scale: 1, rotation: 0, duration: 0.38, ease: "back.out(1.9)" },
            "+=0.14",
          );
          const edge = edges[j];
          if (edge) {
            buildTl.fromTo(
              edge,
              { strokeDasharray: 1, strokeDashoffset: 1, autoAlpha: 1 },
              { strokeDashoffset: 0, duration: 0.3, ease: "power1.inOut" },
              "+=0.06",
            );
          }
        });
        buildTl.fromTo(
          badge,
          { scale: 0, rotation: 6 },
          { scale: 1, rotation: 0, duration: 0.32, ease: "back.out(2.2)" },
          "+=0.25",
        );
        buildTl.to(build, { autoAlpha: 0, duration: 0.3 }, "+=2");
      });

      ScrollTrigger.create({
        trigger: root,
        start: "top 75%",
        end: "bottom 20%",
        onEnter: () => {
          chatTl.play();
          buildTl.play();
          scheduleAutoFlip();
        },
        onLeave: () => {
          chatTl.pause();
          buildTl.pause();
          autoRef.current?.kill();
        },
        onEnterBack: () => {
          chatTl.play();
          buildTl.play();
          scheduleAutoFlip();
        },
        onLeaveBack: () => {
          chatTl.pause();
          buildTl.pause();
          autoRef.current?.kill();
        },
      });

      return () => cleanups.forEach((fn) => fn());
    },
    { scope: ref, dependencies: [reduced] },
  );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-bg)] px-6 py-28 text-[var(--hero-ink)] md:py-36"
    >
      {/* orbiting decor, drifting with the mouse */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <svg
          data-orbit="2.4"
          className="hero-spin-slow absolute left-[8%] top-[22%] hidden size-12 lg:block"
          viewBox="0 0 48 48"
          fill="var(--hero-amber)"
        >
          <path d="M24 0l5.5 18.5L48 24l-18.5 5.5L24 48l-5.5-18.5L0 24l18.5-5.5z" />
        </svg>
        <div
          data-orbit="-1.8"
          className="hero-bob absolute right-[7%] top-[30%] hidden size-14 rounded-full border-[5px] border-[var(--hero-coral)] lg:block"
        />
        <span
          data-orbit="1.5"
          className="hero-bob absolute left-[11%] top-[64%] hidden rotate-[-6deg] rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-3 py-1.5 text-xs font-extrabold text-white shadow-[3px_3px_0_var(--hero-ink)] lg:block"
          style={{ animationDelay: "0.8s" }}
        >
          policy gate
        </span>
        <span
          data-orbit="-2.6"
          className="hero-bob absolute right-[10%] top-[68%] hidden rotate-[5deg] rounded-xl border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-extrabold shadow-[3px_3px_0_var(--hero-ink)] lg:block"
          style={{ animationDelay: "1.4s", color: "var(--hero-blue)" }}
        >
          &ldquo;swap 200 USDC&rdquo;
        </span>
        <svg
          data-orbit="3"
          className="hero-bob absolute right-[24%] top-[14%] hidden size-8 lg:block"
          viewBox="0 0 40 40"
          fill="var(--hero-violet)"
          style={{ animationDelay: "0.4s" }}
        >
          <path d="M16 0h8v16h16v8H24v16h-8V24H0v-8h16z" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-6xl">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/40">
          chat · canvas
        </p>
        <h2 className="mx-auto max-w-3xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          One agent.
          <br className="sm:hidden" /> Two ways to run it.
        </h2>

        {/* face switch */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => flipRef.current?.("chat", true)}
            className={`flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] px-6 py-3 text-sm font-bold transition-all ${
              side === "chat"
                ? "-translate-y-0.5 bg-[var(--hero-coral)] text-white shadow-[4px_4px_0_var(--hero-ink)]"
                : "bg-white shadow-[2px_2px_0_var(--hero-ink)] hover:-translate-y-0.5"
            }`}
          >
            <MessageCircle className="size-4" strokeWidth={2.5} />
            Chat
          </button>
          <button
            type="button"
            onClick={() => flipRef.current?.("canvas", true)}
            className={`flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] px-6 py-3 text-sm font-bold transition-all ${
              side === "canvas"
                ? "-translate-y-0.5 bg-[var(--hero-mint)] text-white shadow-[4px_4px_0_var(--hero-ink)]"
                : "bg-white shadow-[2px_2px_0_var(--hero-ink)] hover:-translate-y-0.5"
            }`}
          >
            <Workflow className="size-4" strokeWidth={2.5} />
            Canvas
          </button>
        </div>
        <p className="mt-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/35">
          click to flip — or wait, it flips itself
        </p>

        {/* ================= the 3D console ================= */}
        <div data-stage className="relative mx-auto mt-16 w-full max-w-[760px]">
          <div className="perspective-[1600px]">
            <div data-float className="transform-3d">
              {/* the buddy rides the top edge (doesn't flip with the panel) */}
              <div
                data-panel-buddy
                className="absolute -top-[104px] left-1/2 z-10 -translate-x-1/2"
              >
                <RadiantBuddy size={112} />
              </div>

              <div data-tilt className="transform-3d">
                <div
                  data-flipper
                  className="transform-3d relative h-[560px] w-full sm:h-[520px]"
                >
                  {/* ---------- FRONT: CHAT ---------- */}
                  <div className="transform-3d backface-hidden absolute inset-0 flex flex-col overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[8px_8px_0_var(--hero-coral)]">
                    <FaceHeader label="radiant — chat" accent="var(--hero-coral)" />
                    <div className="relative flex-1">
                      {SCENARIOS.map((sc, i) => (
                        <div
                          key={i}
                          data-sc
                          className={`absolute inset-0 flex flex-col gap-3 p-6 md:p-8 ${
                            i > 0 ? "invisible opacity-0" : ""
                          }`}
                        >
                          <span
                            data-user
                            className="min-h-[42px] self-end rounded-2xl rounded-br-sm bg-[var(--hero-amber)] px-4 py-2.5 text-sm font-bold [transform:translateZ(46px)]"
                          >
                            <span data-cmd>{sc.cmd}</span>
                          </span>

                          <div className="my-auto flex flex-col gap-4 [transform:translateZ(28px)]">
                            {sc.steps.map((step, j) => (
                              <div key={j} data-step className="flex items-center gap-2.5">
                                <span
                                  data-dot
                                  className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]"
                                >
                                  <Check
                                    data-check
                                    className="size-3 text-white"
                                    strokeWidth={4}
                                  />
                                </span>
                                <span className="text-sm font-bold text-[var(--hero-ink)]/75">
                                  {step.text}
                                </span>
                                {step.via && (
                                  <span
                                    className="rounded-full border-2 border-[var(--hero-ink)]/12 px-2 py-0.5 text-[11px] font-extrabold"
                                    style={{ color: step.viaColor }}
                                  >
                                    {step.via}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          <span
                            data-result
                            className="flex w-fit items-center gap-2 self-start rounded-2xl rounded-bl-sm border-2 border-[var(--hero-ink)]/10 bg-[var(--hero-bg)] px-4 py-2.5 text-sm font-bold [transform:translateZ(46px)]"
                          >
                            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--hero-mint)]">
                              <Check className="size-3 text-white" strokeWidth={3.5} />
                            </span>
                            {sc.result}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ---------- BACK: CANVAS ---------- */}
                  <div className="transform-3d backface-hidden absolute inset-0 flex flex-col overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[8px_8px_0_var(--hero-mint)] [transform:rotateY(180deg)]">
                    <FaceHeader label="radiant — canvas" accent="var(--hero-mint)" />
                    <div
                      className="relative flex flex-1 items-center justify-center overflow-hidden"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle, rgba(27,22,16,0.12) 1.5px, transparent 1.5px)",
                        backgroundSize: "24px 24px",
                      }}
                    >
                      <div className="relative h-[440px] w-[640px] shrink-0 scale-[0.52] sm:scale-75 md:scale-100">
                        {BUILDS.map((build, b) => (
                          <div
                            key={b}
                            data-build
                            className={`absolute inset-0 ${b > 0 ? "invisible opacity-0" : ""}`}
                          >
                            <span
                              data-build-chip
                              className="absolute left-2 top-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-3 py-1 text-xs font-extrabold text-[var(--hero-bg)] [transform:translateZ(40px)]"
                            >
                              {build.name}
                            </span>

                            <svg
                              className="absolute inset-0 h-full w-full"
                              viewBox="0 0 640 440"
                              fill="none"
                              aria-hidden
                            >
                              {BUILD_EDGES.map((d, e) => (
                                <path
                                  key={e}
                                  data-build-edge
                                  d={d}
                                  pathLength={1}
                                  stroke="rgba(27,22,16,0.4)"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />
                              ))}
                            </svg>

                            {build.nodes.map(({ title, sub, color, Icon }, n) => (
                              <div
                                key={n}
                                data-build-node
                                className="absolute flex h-[64px] w-[150px] items-center gap-2.5 rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-2.5 will-change-transform [transform:translateZ(30px)]"
                                style={{
                                  left: NODE_POS[n].x,
                                  top: NODE_POS[n].y,
                                  boxShadow: `3px 3px 0 ${color}`,
                                }}
                              >
                                <span
                                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--hero-ink)] text-white"
                                  style={{ backgroundColor: color }}
                                >
                                  <Icon className="size-4" strokeWidth={2.4} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate font-heading text-[13px] font-extrabold leading-tight">
                                    {title}
                                  </span>
                                  <span className="block truncate text-[10px] font-semibold text-[var(--hero-ink)]/55">
                                    {sub}
                                  </span>
                                </span>
                              </div>
                            ))}

                            <span
                              data-build-badge
                              className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-3 py-1 text-xs font-extrabold text-white shadow-[2px_2px_0_var(--hero-ink)] [transform:translateZ(40px)]"
                            >
                              <Check className="size-3.5" strokeWidth={3.5} />
                              Dry-run passed
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ground shadow — sells the levitation */}
          <div
            data-ground
            aria-hidden
            className="mx-auto mt-10 h-5 w-3/4 rounded-[50%] bg-[var(--hero-ink)]/20 blur-md"
          />
        </div>

        <p className="mt-12 text-center text-base font-bold text-[var(--hero-ink)]/50">
          Same wallet. Same memory.{" "}
          <span className="text-[var(--hero-ink)]">
            One is a sentence, the other is a machine.
          </span>
        </p>
      </div>
    </section>
  );
}

function FaceHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div
      className="flex items-center gap-2 border-b-2 border-[var(--hero-ink)] px-5 py-3"
      style={{ backgroundColor: accent }}
    >
      <span className="size-2.5 rounded-full border-2 border-[var(--hero-ink)] bg-white" />
      <span className="size-2.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]" />
      <span className="size-2.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)]" />
      <span className="ml-2 text-xs font-extrabold uppercase tracking-[0.18em] text-white">
        {label}
      </span>
    </div>
  );
}
