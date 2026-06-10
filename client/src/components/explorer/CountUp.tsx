"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { fmt } from "@/lib/explorer-data";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type CountUpProps = {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

/** Number that counts up from 0 when scrolled into view. */
export function CountUp({ value, prefix = "", suffix = "", className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const render = (v: number) => {
        el.textContent = `${prefix}${fmt(Math.round(v))}${suffix}`;
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        render(value);
        return;
      }
      const counter = { v: 0 };
      gsap.to(counter, {
        v: value,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%" },
        onUpdate: () => render(counter.v),
      });
    },
    { dependencies: [value, prefix, suffix] },
  );

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}
