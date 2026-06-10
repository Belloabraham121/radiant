"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { HERO_PHRASES } from "./apps";

const INTERVAL = 3400;

export function EvolvingWord() {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    const renderChars = (phrase: string) => {
      text.replaceChildren(
        ...[...phrase].map((ch) => {
          const s = document.createElement("span");
          s.textContent = ch === " " ? "\u00A0" : ch;
          s.style.display = "inline-block";
          return s;
        }),
      );
    };

    let idx = 0;
    renderChars(HERO_PHRASES[0].text);
    box.style.backgroundColor = HERO_PHRASES[0].color;
    box.style.color = HERO_PHRASES[0].fg;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cycle = () => {
      idx = (idx + 1) % HERO_PHRASES.length;
      const next = HERO_PHRASES[idx];

      gsap.to(text.children, {
        yPercent: -130,
        opacity: 0,
        stagger: 0.016,
        duration: 0.32,
        ease: "power2.in",
        onComplete: () => {
          const oldW = box.offsetWidth;
          renderChars(next.text);
          box.style.color = next.fg;
          const newW = box.offsetWidth;
          // targets must be re-resolved after replaceChildren — old nodes are gone
          gsap.set(text.children, { yPercent: 130, opacity: 0 });
          gsap.fromTo(
            box,
            { width: oldW },
            { width: newW, duration: 0.45, ease: "power3.inOut", clearProps: "width" },
          );
          gsap.to(box, { backgroundColor: next.color, duration: 0.45, ease: "power2.inOut" });
          gsap.to(text.children, {
            yPercent: 0,
            opacity: 1,
            stagger: 0.022,
            duration: 0.46,
            ease: "back.out(1.6)",
          });
        },
      });
    };

    const id = setInterval(cycle, INTERVAL);
    return () => {
      clearInterval(id);
      gsap.killTweensOf([box, ...text.children]);
    };
  }, []);

  return (
    <span
      ref={boxRef}
      className="inline-block overflow-hidden rounded-2xl px-4 pb-2 pt-1 align-baseline -rotate-1 whitespace-nowrap md:px-6"
    >
      <span ref={textRef} className="inline-block" />
    </span>
  );
}
