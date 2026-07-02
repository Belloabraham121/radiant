"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Draggable } from "gsap/Draggable";
import { useGSAP } from "@gsap/react";
import { SideBot } from "./SideBot";
import { WordReveal } from "./WordReveal";

gsap.registerPlugin(ScrollTrigger, Draggable, useGSAP);

type Protocol = {
  name: string;
  img: string;
  tag: string;
  accent: string;
  soon?: boolean;
  /** logo aspect handling: wordmark svgs get wide slots, icons get square */
  wide?: boolean;
};

const PROTOCOLS: Protocol[] = [
  { name: "DeepBook", img: "/logos/deepbook.png", tag: "CLOB · flash loans", accent: "var(--hero-blue)" },
  { name: "Li-Fi", img: "/logos/lifi.svg", tag: "cross-chain swaps", accent: "var(--hero-violet)", wide: true },
  { name: "Squid", img: "/logos/squid.svg", tag: "bridge 100+ chains", accent: "var(--hero-amber)" },
  { name: "Soroswap", img: "/logos/soroswap.png", tag: "Stellar DEX", accent: "var(--hero-mint)" },
  { name: "Polymarket", img: "/logos/polymarket.png", tag: "prediction markets", accent: "var(--hero-coral)" },
  { name: "Limitless", img: "/logos/limitless.svg", tag: "prediction markets", accent: "var(--hero-violet)", soon: true },
];

function Tile({ p }: { p: Protocol }) {
  return (
    <div className="group relative flex shrink-0 items-center gap-4 rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-6 py-4 shadow-[4px_4px_0_var(--hero-ink)] transition-transform duration-300 hover:-translate-y-1.5 hover:rotate-1">
      <Image
        src={p.img}
        alt={`${p.name} logo`}
        width={p.wide ? 72 : 40}
        height={40}
        unoptimized
        className="h-10 w-auto object-contain grayscale transition-all duration-300 group-hover:grayscale-0"
      />
      <span>
        <span className="block font-heading text-lg font-extrabold leading-tight">{p.name}</span>
        <span className="block text-xs font-bold" style={{ color: p.accent }}>
          {p.tag}
        </span>
      </span>
      {p.soon && (
        <span className="absolute -right-2 -top-2 rotate-6 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
          soon
        </span>
      )}
    </div>
  );
}

/* idle repertoire, cycled between naps and walks */
const BEATS = ["blink", "hop", "blink", "patrol", "blink", "sit", "patrol", "hop"] as const;

export function DeFiRailSection() {
  const ref = useRef<HTMLElement>(null);
  const doubled = [...PROTOCOLS, ...PROTOCOLS];

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const root = ref.current!;
      const strip = root.querySelector<HTMLElement>("[data-bot-strip]");
      const wrap = root.querySelector<HTMLElement>("[data-bot-wrap]");
      const fig = root.querySelector<SVGSVGElement>("[data-bot-figure]");
      const sideView = root.querySelector("[data-bot-view-side]");
      const frontView = root.querySelector("[data-bot-view-front]");
      const sideInner = root.querySelector("[data-bot-inner]");
      const eyeS = root.querySelector("[data-bot-eye]");
      const eyeF = root.querySelector("[data-bot-eye-f]");
      const pupilsF = Array.from(root.querySelectorAll("[data-bot-pupil-f]"));
      const sideLegs = [root.querySelector("[data-bot-leg-f]"), root.querySelector("[data-bot-leg-b]")];
      const flegs = Array.from(root.querySelectorAll("[data-bot-fleg]"));
      const farms = Array.from(root.querySelectorAll("[data-bot-farm]"));
      const shadow = root.querySelector("[data-bot-shadow]");
      if (!strip || !wrap || !fig || !sideView || !frontView || !sideInner || !shadow) return;
      // hoisted function declarations below lose TS narrowing — alias it
      const wrapEl = wrap;

      // ---------------- view switching ----------------
      const showFront = () => {
        gsap.set(sideView, { autoAlpha: 0 });
        gsap.set(frontView, { autoAlpha: 1 });
      };
      const showSide = (dir: 1 | -1) => {
        gsap.set(frontView, { autoAlpha: 0 });
        gsap.set(sideView, { autoAlpha: 1 });
        gsap.set(sideInner, { scaleX: dir, transformOrigin: "50% 50%" });
      };

      // ---------------- behavior engine ----------------
      let beatIndex = 0;
      let beatCall: gsap.core.Tween | null = null;
      let moveTween: gsap.core.Tween | null = null;
      let dragging = false;
      let started = false;
      let inView = true;

      const bounds = () => {
        const stripW = strip.clientWidth;
        const naturalLeft = wrap.offsetLeft;
        return {
          xMin: -naturalLeft + 6,
          xMax: stripW - naturalLeft - wrap.offsetWidth - 6,
        };
      };

      function schedule(delay = gsap.utils.random(1.0, 2.2)) {
        beatCall?.kill();
        beatCall = gsap.delayedCall(delay, doBeat);
      }

      const blinkFront = () =>
        gsap.to(eyeF, { scaleY: 0.08, transformOrigin: "50% 50%", duration: 0.07, yoyo: true, repeat: 1 });

      function doBeat() {
        if (dragging || !inView) return;
        const beat = BEATS[beatIndex++ % BEATS.length];

        if (beat === "blink") {
          blinkFront();
          schedule();
        } else if (beat === "hop") {
          gsap.to(fig, { y: -16, duration: 0.22, ease: "power2.out" });
          gsap.to(fig, { y: 0, duration: 0.4, ease: "bounce.out", delay: 0.22, onComplete: () => schedule() });
        } else if (beat === "patrol") {
          // stroll somewhere else on the strip, side profile, legs pumping
          const { xMin, xMax } = bounds();
          const x = Number(gsap.getProperty(wrap, "x"));
          let dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
          let target = gsap.utils.clamp(xMin, xMax, x + dir * gsap.utils.random(80, 170));
          if (Math.abs(target - x) < 40) {
            dir = dir === 1 ? -1 : 1;
            target = gsap.utils.clamp(xMin, xMax, x + dir * gsap.utils.random(80, 170));
          }
          showSide(dir);
          wrapEl.classList.add("sidebot-run");
          moveTween = gsap.to(wrapEl, {
            x: target,
            duration: Math.abs(target - x) / 95,
            ease: "none",
            onComplete: () => {
              wrapEl.classList.remove("sidebot-run");
              showFront();
              schedule();
            },
          });
        } else if (beat === "sit") {
          // plop down for a breather, then get back up
          showSide(1);
          const sit = gsap.timeline({ onComplete: () => schedule() });
          sit.to(sideLegs, { rotation: -85, transformOrigin: "50% 10%", duration: 0.28, ease: "power2.out" });
          sit.to(fig, { y: 18, duration: 0.28, ease: "power2.out" }, "<");
          sit.to(eyeS, { scaleY: 0.08, transformOrigin: "50% 50%", duration: 0.07, yoyo: true, repeat: 1 }, "+=1.2");
          sit.to(sideLegs, { rotation: 0, duration: 0.3 }, "+=1.3");
          sit.to(fig, { y: 0, duration: 0.3, ease: "back.out(1.6)" }, "<");
          sit.add(() => showFront());
        }
      }

      function interrupt() {
        beatCall?.kill();
        moveTween?.kill();
        moveTween = null;
        wrapEl.classList.remove("sidebot-run");
        gsap.killTweensOf(fig);
        gsap.set(fig, { y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
        gsap.set(sideLegs, { rotation: 0 });
      }

      // ---------------- entrance: run in, flip, land ----------------
      const master = gsap.timeline({ paused: true });
      master.add(() => showSide(1));
      master.set(wrap, { x: () => -(wrap.offsetLeft + 220) });
      master.add(() => wrap.classList.add("sidebot-run"));
      master.to(wrap, { x: -110, duration: 2.3, ease: "none" });
      master.add(() => wrap.classList.remove("sidebot-run"));
      master.to(fig, { scaleY: 0.8, scaleX: 1.08, transformOrigin: "50% 100%", duration: 0.13 });
      master.to(fig, { y: -95, scaleY: 1, scaleX: 1, duration: 0.38, ease: "power2.out" });
      master.to(fig, { rotation: 360, duration: 0.62, ease: "power1.inOut" }, "<");
      master.to(wrap, { x: 0, duration: 0.72, ease: "none" }, "<");
      master.to(shadow, { scaleX: 0.55, opacity: 0.4, duration: 0.3 }, "<");
      master.to(fig, { y: 0, duration: 0.28, ease: "power2.in" }, ">-0.3");
      master.set(fig, { rotation: 0 });
      master.to(shadow, { scaleX: 1, opacity: 1, duration: 0.2 }, "<");
      master.to(fig, { scaleY: 0.76, scaleX: 1.16, transformOrigin: "50% 100%", duration: 0.1 });
      master.to(fig, { scaleY: 1, scaleX: 1, duration: 0.65, ease: "elastic.out(1.2, 0.4)" });
      master.add(() => {
        showFront();
        started = true;
        schedule(0.8);
      });

      // ---------------- pick me up! ----------------
      let dangleTweens: gsap.core.Tween[] = [];

      const drag = Draggable.create(wrap, {
        type: "x,y",
        bounds: strip,
        cursor: "grab",
        activeCursor: "grabbing",
        zIndexBoost: false,
        onPress() {
          this.applyBounds(strip);
          dragging = true;
          master.kill();
          interrupt();
          showFront();
          started = true;
          // dangle: legs and arms swing while carried
          dangleTweens = [
            gsap.to(flegs, {
              rotation: (i: number) => (i ? 14 : -14),
              transformOrigin: "50% 8%",
              duration: 0.22,
              yoyo: true,
              repeat: -1,
              ease: "sine.inOut",
            }),
            gsap.to(farms, {
              rotation: (i: number) => (i ? -18 : 18),
              transformOrigin: "50% 8%",
              duration: 0.26,
              yoyo: true,
              repeat: -1,
              ease: "sine.inOut",
            }),
          ];
          blinkFront();
        },
        onDrag() {
          // shadow shrinks the higher he's lifted
          const lift = gsap.utils.clamp(0.4, 1, 1 + this.y / 320);
          gsap.set(shadow, { scaleX: lift, opacity: lift });
        },
        onRelease() {
          dragging = false;
          dangleTweens.forEach((t) => t.kill());
          dangleTweens = [];
          gsap.to([...flegs, ...farms], { rotation: 0, duration: 0.25 });
          // gravity: fall back to the ground and stick the landing
          const y = Number(gsap.getProperty(wrap, "y"));
          const fall = Math.max(0.16, Math.sqrt(Math.abs(y) / 900));
          const land = gsap.timeline({ onComplete: () => schedule(0.9) });
          land.to(wrap, { y: 0, duration: fall, ease: "power2.in" });
          land.to(shadow, { scaleX: 1, opacity: 1, duration: 0.15 }, "<");
          land.to(fig, { scaleY: 0.78, scaleX: 1.15, transformOrigin: "50% 100%", duration: 0.1 });
          land.to(fig, { scaleY: 1, scaleX: 1, duration: 0.55, ease: "elastic.out(1.2, 0.4)" });
        },
      })[0];

      // front pupils follow your cursor
      const cleanups: (() => void)[] = [];
      if (window.matchMedia("(pointer: fine)").matches && pupilsF.length) {
        const pxs = pupilsF.map((p) => gsap.quickTo(p, "x", { duration: 0.3, ease: "power3" }));
        const pys = pupilsF.map((p) => gsap.quickTo(p, "y", { duration: 0.3, ease: "power3" }));
        const look = (e: PointerEvent) => {
          const r = wrap.getBoundingClientRect();
          const nx = gsap.utils.clamp(-1, 1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 3));
          const ny = gsap.utils.clamp(-1, 1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 3));
          pxs.forEach((fn) => fn(nx * 3.6));
          pys.forEach((fn) => fn(ny * 3));
        };
        window.addEventListener("pointermove", look, { passive: true });
        cleanups.push(() => window.removeEventListener("pointermove", look));
      }

      ScrollTrigger.create({
        trigger: strip,
        start: "top 85%",
        once: true,
        onEnter: () => {
          if (!started) master.play();
        },
      });
      // don't run beats while nobody's watching
      ScrollTrigger.create({
        trigger: root,
        start: "top bottom",
        end: "bottom top",
        onEnter: () => {
          inView = true;
          if (started && !dragging) schedule(0.5);
        },
        onEnterBack: () => {
          inView = true;
          if (started && !dragging) schedule(0.5);
        },
        onLeave: () => {
          inView = false;
          beatCall?.kill();
        },
        onLeaveBack: () => {
          inView = false;
          beatCall?.kill();
        },
      });

      return () => {
        drag.kill();
        cleanups.forEach((fn) => fn());
      };
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[var(--hero-bg)] py-24 text-[var(--hero-ink)] md:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/40">
          real rails underneath
        </p>
        <WordReveal
          text="It runs on the real thing."
          className="mx-auto max-w-3xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
        />
        <p className="mx-auto mt-6 max-w-xl text-center text-base font-medium leading-relaxed text-[var(--hero-ink)]/65 md:text-lg">
          Orders hit DeepBook&apos;s shared order book. Bridges route through Li-Fi and Squid.
          And every live order passes your policy gate first.
        </p>
      </div>

      <div className="mt-14 overflow-hidden">
        <div className="hero-marquee-slow flex w-max items-center gap-6 pr-6">
          {doubled.map((p, i) => (
            <Tile key={`${p.name}-${i}`} p={p} />
          ))}
        </div>
      </div>

      {/* the bot's playground, right under the rails */}
      <div className="mx-auto max-w-6xl px-6">
        <div
          data-bot-strip
          className="relative h-[190px] border-b-[3px] border-[var(--hero-ink)]/15"
        >
          <span className="pointer-events-none absolute bottom-3 right-0 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/30">
            psst — you can pick him up
          </span>
          <div className="absolute bottom-0 left-[12%] cursor-grab">
            <SideBot size={104} />
          </div>
        </div>
      </div>

      <p className="mt-10 text-center text-xs font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/35">
        dry-runs simulate everything · live mode executes for real
      </p>
    </section>
  );
}
