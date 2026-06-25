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

    // Animated letters, tracked across re-renders. Letters are grouped into
    // per-word wrappers so a phrase only ever breaks *between* words on narrow
    // screens — never mid-word (e.g. "everythi/ng" or "slee/p").
    let chars: HTMLElement[] = [];

    const renderChars = (phrase: string) => {
      chars = [];
      const frag = document.createDocumentFragment();
      const words = phrase.split(" ");
      words.forEach((word, wordIndex) => {
        const wordEl = document.createElement("span");
        wordEl.style.display = "inline-block";
        wordEl.style.whiteSpace = "nowrap";
        for (const ch of word) {
          const c = document.createElement("span");
          c.textContent = ch;
          c.style.display = "inline-block";
          wordEl.appendChild(c);
          chars.push(c);
        }
        frag.appendChild(wordEl);
        if (wordIndex < words.length - 1) {
          // Breakable gap between words.
          frag.appendChild(document.createTextNode(" "));
        }
      });
      text.replaceChildren(frag);
    };

    let idx = 0;
    renderChars(HERO_PHRASES[0].text);
    box.style.backgroundColor = HERO_PHRASES[0].color;
    box.style.color = HERO_PHRASES[0].fg;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cycle = () => {
      idx = (idx + 1) % HERO_PHRASES.length;
      const next = HERO_PHRASES[idx];

      gsap.to(chars, {
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
          gsap.set(chars, { yPercent: 130, opacity: 0 });
          gsap.fromTo(
            box,
            { width: oldW },
            { width: newW, duration: 0.45, ease: "power3.inOut", clearProps: "width" },
          );
          gsap.to(box, { backgroundColor: next.color, duration: 0.45, ease: "power2.inOut" });
          gsap.to(chars, {
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
      gsap.killTweensOf(box);
      gsap.killTweensOf(chars);
    };
  }, []);

  return (
    <span
      ref={boxRef}
      className="inline-block max-w-full overflow-hidden whitespace-normal rounded-2xl px-4 pb-2 pt-1 align-baseline -rotate-1 md:whitespace-nowrap md:px-6"
    >
      <span ref={textRef} className="inline-block" />
    </span>
  );
}
