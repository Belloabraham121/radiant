"use client";

import { useState } from "react";
import { RadiantLogo } from "./RadiantLogo";

const LINKS = [
  { href: "#vision", label: "Vision" },
  { href: "#ecosystem", label: "Ecosystem" },
  { href: "#app-store", label: "App Store" },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-30 flex justify-center px-4 pt-5 sm:pt-6">
      <div className="w-full max-w-3xl rounded-full border border-white/12 bg-black/45 shadow-[0_18px_50px_-28px_hsla(195,100%,50%,0.45)] backdrop-blur-xl">
        <nav className="flex h-14 items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 text-white">
            <RadiantLogo className="size-7 shrink-0" />
            <span className="font-(family-name:--font-instrument-serif) text-xl tracking-tight sm:text-2xl">
              Radiant
            </span>
          </a>

          <div className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/65 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#waitlist"
              className="rounded-full border border-white/25 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/5"
            >
              Join Waitlist
            </a>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-3 py-1.5 text-sm text-white md:hidden"
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </nav>
      </div>

      {open ? (
        <div
          id="landing-mobile-nav"
          className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-40 rounded-2xl border border-white/12 bg-black/95 px-5 py-4 shadow-xl backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-3">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/80"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#waitlist"
              className="pt-1 text-sm font-semibold text-[hsl(193,85%,66%)]"
              onClick={() => setOpen(false)}
            >
              Join Waitlist
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
