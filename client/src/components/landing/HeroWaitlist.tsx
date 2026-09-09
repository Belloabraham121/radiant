"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "./useReducedMotion";

gsap.registerPlugin(useGSAP);

export function HeroWaitlist() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      gsap.fromTo(
        "[data-hero-fade]",
        { y: 28, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.85,
          stagger: 0.1,
          ease: "power3.out",
          delay: 0.1,
        },
      );
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <section
      ref={root}
      className="relative px-5 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-10"
    >
      <div className="relative mx-auto max-w-5xl text-center">
        <h1
          data-hero-fade
          className="font-(family-name:--font-instrument-serif) text-[2.75rem] leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[5.25rem]"
        >
          Don&apos;t navigate the ecosystem. Let the ecosystem generate around
          you.
        </h1>

        <p
          data-hero-fade
          className="mt-6 text-xl font-medium text-[hsl(193,85%,66%)] sm:text-2xl"
        >
          The Universal Agentic Terminal for Base.
        </p>

        <p
          data-hero-fade
          className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg"
        >
          Type your intent. Radiant generates a live dashboard across Base
          protocols—trade, lend, automate, and stay informed on one canvas.
        </p>

        <div data-hero-fade className="mx-auto mt-10 flex flex-col items-center gap-4">
          <a
            href="#waitlist"
            className="inline-flex items-center justify-center rounded-full bg-[hsl(195,100%,50%)] px-8 py-3.5 text-base font-semibold text-black transition-[transform,background-color] hover:bg-[hsl(193,85%,66%)] active:scale-[0.98]"
          >
            Join Waitlist
          </a>
          <p className="max-w-md text-sm text-white/45">
            Early access grants priority agent deployment and zero-fee gas
            sponsorship.
          </p>
        </div>
      </div>
    </section>
  );
}
