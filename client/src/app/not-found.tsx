"use client";

import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Home, Sparkles } from "lucide-react";

gsap.registerPlugin(useGSAP);

/** Two googly eyes + a smile, reused across the 4-4 characters and the 0 ball. */
function Face({ smile = true }: { smile?: boolean }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
      <span className="flex gap-2 sm:gap-3">
        <span className="flex size-4 items-center justify-center rounded-full bg-white sm:size-6">
          <span data-pupil className="size-2 rounded-full bg-(--hero-ink) sm:size-2.5" />
        </span>
        <span className="flex size-4 items-center justify-center rounded-full bg-white sm:size-6">
          <span data-pupil className="size-2 rounded-full bg-(--hero-ink) sm:size-2.5" />
        </span>
      </span>
      {smile ? (
        <span className="h-2 w-5 rounded-b-full border-2 border-t-0 border-(--hero-ink) sm:h-3 sm:w-7" />
      ) : null}
    </span>
  );
}

export default function NotFound() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // Quick, playful entrance.
      gsap
        .timeline()
        .from("[data-deco]", {
          scale: 0,
          opacity: 0,
          duration: 0.5,
          stagger: 0.06,
          ease: "back.out(2.5)",
        })
        .from(
          "[data-digit]",
          {
            y: 80,
            opacity: 0,
            rotate: -10,
            duration: 0.7,
            stagger: 0.12,
            ease: "back.out(1.6)",
          },
          "-=0.2",
        )
        .from(
          "[data-copy]",
          { y: 22, opacity: 0, duration: 0.5, stagger: 0.08, ease: "power2.out" },
          "-=0.25",
        );

      // Looping "play": the 4s juggle the 0.
      gsap.to("[data-ball]", {
        y: -28,
        duration: 0.72,
        ease: "power1.inOut",
        yoyo: true,
        repeat: -1,
      });
      gsap.to("[data-four='left']", {
        rotate: -6,
        transformOrigin: "bottom center",
        duration: 1.1,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
      gsap.to("[data-four='right']", {
        rotate: 6,
        transformOrigin: "bottom center",
        duration: 1.1,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: 0.25,
      });
      gsap.to("[data-pupil]", {
        x: 3,
        duration: 0.9,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
      gsap.to("[data-float]", {
        y: -18,
        rotate: "+=10",
        duration: 2.6,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: { each: 0.3, from: "random" },
      });
      gsap.to("[data-spin]", { rotate: 360, duration: 9, ease: "none", repeat: -1 });
    },
    { scope: root },
  );

  return (
    <main
      ref={root}
      className="hero-selection relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-(--hero-bg) px-6 py-16 text-center text-(--hero-ink)"
    >
      {/* Decorative floating shapes */}
      <span
        data-deco
        data-float
        aria-hidden
        className="absolute left-[8%] top-[16%] size-12 rounded-2xl border-2 border-(--hero-ink) bg-(--hero-mint) shadow-[4px_4px_0_var(--hero-ink)] sm:size-16"
      />
      <span
        data-deco
        data-spin
        aria-hidden
        className="absolute right-[10%] top-[14%] size-14 border-2 border-(--hero-ink) bg-(--hero-violet) shadow-[4px_4px_0_var(--hero-ink)] [clip-path:polygon(50%_0,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)] sm:size-20"
      />
      <span
        data-deco
        data-float
        aria-hidden
        className="absolute bottom-[18%] left-[12%] size-10 rounded-full border-2 border-(--hero-ink) bg-(--hero-blue) shadow-[4px_4px_0_var(--hero-ink)] sm:size-14"
      />
      <span
        data-deco
        data-float
        aria-hidden
        className="absolute bottom-[16%] right-[12%] size-12 rotate-12 rounded-2xl border-2 border-(--hero-ink) bg-(--hero-coral) shadow-[4px_4px_0_var(--hero-ink)] sm:size-16"
      />

      {/* 4 0 4 — the two 4s juggle the 0 */}
      <div className="relative z-10 flex items-end justify-center gap-2 sm:gap-5">
        <span
          data-digit
          data-four="left"
          className="relative flex h-28 w-24 items-center justify-center rounded-3xl border-2 border-(--hero-ink) bg-(--hero-coral) shadow-[6px_6px_0_var(--hero-ink)] sm:h-48 sm:w-40"
        >
          <span className="font-heading text-7xl font-extrabold leading-none text-(--hero-bg) sm:text-9xl">
            4
          </span>
          <span className="absolute left-1/2 top-3 -translate-x-1/2 sm:top-5">
            <span className="flex gap-1.5 sm:gap-2">
              <span className="flex size-3.5 items-center justify-center rounded-full bg-white sm:size-5">
                <span data-pupil className="size-1.5 rounded-full bg-(--hero-ink) sm:size-2" />
              </span>
              <span className="flex size-3.5 items-center justify-center rounded-full bg-white sm:size-5">
                <span data-pupil className="size-1.5 rounded-full bg-(--hero-ink) sm:size-2" />
              </span>
            </span>
          </span>
        </span>

        <span
          data-digit
          data-ball
          className="relative flex size-24 items-center justify-center rounded-full border-2 border-(--hero-ink) bg-(--hero-amber) shadow-[6px_6px_0_var(--hero-ink)] sm:size-40"
        >
          <Face />
        </span>

        <span
          data-digit
          data-four="right"
          className="relative flex h-28 w-24 items-center justify-center rounded-3xl border-2 border-(--hero-ink) bg-(--hero-blue) shadow-[6px_6px_0_var(--hero-ink)] sm:h-48 sm:w-40"
        >
          <span className="font-heading text-7xl font-extrabold leading-none text-(--hero-bg) sm:text-9xl">
            4
          </span>
          <span className="absolute left-1/2 top-3 -translate-x-1/2 sm:top-5">
            <span className="flex gap-1.5 sm:gap-2">
              <span className="flex size-3.5 items-center justify-center rounded-full bg-white sm:size-5">
                <span data-pupil className="size-1.5 rounded-full bg-(--hero-ink) sm:size-2" />
              </span>
              <span className="flex size-3.5 items-center justify-center rounded-full bg-white sm:size-5">
                <span data-pupil className="size-1.5 rounded-full bg-(--hero-ink) sm:size-2" />
              </span>
            </span>
          </span>
        </span>
      </div>

      <span
        data-copy
        className="z-10 mt-10 inline-flex items-center gap-1.5 rounded-full border-2 border-(--hero-ink) bg-(--hero-amber)/20 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em]"
      >
        <Sparkles className="size-3.5 text-(--hero-amber)" strokeWidth={3} />
        Error 404
      </span>

      <h1
        data-copy
        className="z-10 mt-5 max-w-xl font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
      >
        This page wandered off.
      </h1>

      <p
        data-copy
        className="z-10 mt-4 max-w-md text-sm font-medium text-(--hero-ink)/55 sm:text-base"
      >
        The link is broken or the page moved. While our little agents keep
        juggling, let&rsquo;s get you back to solid ground.
      </p>

      <div data-copy className="z-10 mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border-2 border-(--hero-ink) bg-(--hero-ink) px-6 py-3 text-sm font-bold text-(--hero-bg) shadow-[3px_3px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Home className="size-4" strokeWidth={2.5} />
          Back home
        </Link>
        <Link
          href="/app"
          className="inline-flex items-center gap-2 rounded-full border-2 border-(--hero-ink) bg-white px-6 py-3 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          Open the app
          <ArrowRight className="size-4" strokeWidth={2.5} />
        </Link>
      </div>
    </main>
  );
}
