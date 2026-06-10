"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Sparkles } from "lucide-react";
import { PHONE_APPS } from "../hero/apps";
import { Scramble } from "./Scramble";
import { useReducedMotion } from "./useReducedMotion";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const GlitchPhone = dynamic(() => import("./GlitchPhone"), {
  ssr: false,
  loading: () => null,
});

export function ShowcaseSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(0);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();

  const app = PHONE_APPS[active];

  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: wrapRef.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate(self) {
          const idx = Math.min(
            PHONE_APPS.length - 1,
            Math.floor(self.progress * PHONE_APPS.length),
          );
          if (idx !== idxRef.current) {
            idxRef.current = idx;
            setActive(idx);
          }
        },
      });
    },
    { scope: wrapRef },
  );

  // animate the text panel in whenever the active app changes
  useGSAP(
    () => {
      if (reduced) return;
      gsap.fromTo(
        "[data-showcase-item]",
        { y: 28, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, stagger: 0.08, ease: "power3.out" },
      );
      gsap.fromTo(
        "[data-showcase-number]",
        { yPercent: 30, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.7, ease: "power3.out" },
      );
    },
    { scope: wrapRef, dependencies: [active, reduced] },
  );

  return (
    <section ref={wrapRef} className="relative h-[500vh] bg-[var(--hero-bg)]">
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        {/* soft accent wash that follows the active app */}
        <div
          className="absolute inset-0 transition-colors duration-700"
          style={{ backgroundColor: `${app.accent}14` }}
        />

        {/* giant ghost number */}
        <div
          key={`num-${active}`}
          data-showcase-number
          className="pointer-events-none absolute right-[4%] top-1/2 hidden -translate-y-1/2 select-none font-heading text-[34vh] font-extrabold leading-none lg:block"
          style={{ color: `${app.accent}26` }}
        >
          0{active + 1}
        </div>

        <div className="relative z-10 mx-auto grid h-full w-full max-w-7xl grid-cols-1 items-center gap-2 px-6 lg:grid-cols-2 lg:gap-10 lg:px-12">
          {/* text panel */}
          <div key={active} className="order-2 pb-10 text-center lg:order-1 lg:pb-0 lg:text-left">
            <div
              data-showcase-item
              className="mb-5 inline-flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-1.5 text-sm font-bold shadow-[2px_2px_0_var(--hero-ink)]"
              style={{ color: app.accent }}
            >
              {String(active + 1).padStart(2, "0")} / 0{PHONE_APPS.length} — {app.tagline}
            </div>

            <h2 className="font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              <Scramble text={app.headline} />
            </h2>

            <p
              data-showcase-item
              className="mx-auto mt-6 max-w-md text-base font-medium leading-relaxed text-[var(--hero-ink)]/65 lg:mx-0 lg:text-lg"
            >
              {app.description}
            </p>

            <div data-showcase-item className="mt-8 flex justify-center lg:justify-start">
              <span className="flex rotate-[-1deg] items-center gap-2 rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-5 py-3 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0]">
                <Sparkles className="size-4" style={{ color: app.accent }} strokeWidth={2.5} />
                &ldquo;{app.command}&rdquo;
              </span>
            </div>

            <p
              data-showcase-item
              className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40"
            >
              You said it. Radiant built {app.name}.
            </p>
          </div>

          {/* phone */}
          <div className="order-1 h-[42vh] w-full sm:h-[48vh] lg:order-2 lg:h-[72vh]">
            <GlitchPhone app={app} reduced={reduced} />
          </div>
        </div>

        {/* progress rail */}
        <div className="absolute left-5 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
          {PHONE_APPS.map((a, i) => (
            <span
              key={a.id}
              className="size-2.5 rounded-full border-2 border-[var(--hero-ink)] transition-all duration-300"
              style={{
                backgroundColor: i === active ? a.accent : "transparent",
                transform: i === active ? "scale(1.4)" : "scale(1)",
              }}
            />
          ))}
        </div>

        <p className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-xs font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/35">
          keep scrolling
        </p>
      </div>
    </section>
  );
}
