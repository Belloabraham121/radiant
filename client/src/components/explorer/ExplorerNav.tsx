"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { TryRadiantLink } from "@/components/auth/TryRadiantLink";

export function ExplorerNav({ backTo }: { backTo?: { href: string; label: string } }) {
  return (
    <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-2xl font-extrabold">
          <Sparkles className="size-6 text-[var(--hero-amber)]" strokeWidth={2.5} />
          Radiant
        </Link>
        {backTo && (
          <Link
            href={backTo.href}
            className="hidden items-center gap-1.5 text-sm font-bold text-[var(--hero-ink)]/50 transition-colors hover:text-[var(--hero-ink)] sm:flex"
          >
            <ArrowLeft className="size-4" strokeWidth={2.5} />
            {backTo.label}
          </Link>
        )}
      </div>
      <TryRadiantLink
        className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-5 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-amber)] transition-transform hover:-translate-y-0.5"
      >
        Try Radiant
      </TryRadiantLink>
    </header>
  );
}
