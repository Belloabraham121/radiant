"use client";

import { useEffect, useRef } from "react";

const GLYPHS = "!<>-_\\/[]{}—=+*^?#$%&@";

/** Types `text` in with a glitchy character scramble. Re-runs whenever `text` changes. */
export function Scramble({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = text;
      return;
    }

    let frame = 0;
    const totalFrames = Math.max(14, Math.round(text.length * 1.4));
    el.textContent = "";

    const id = setInterval(() => {
      frame++;
      const settled = Math.floor((frame / totalFrames) * text.length);
      const scrambled = [...text.slice(settled)]
        .map((c) => (c === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
        .join("");
      el.textContent = text.slice(0, settled) + scrambled;
      if (frame >= totalFrames) {
        el.textContent = text;
        clearInterval(id);
      }
    }, 28);

    return () => clearInterval(id);
  }, [text]);

  return <span ref={ref} className={className} aria-label={text} />;
}
