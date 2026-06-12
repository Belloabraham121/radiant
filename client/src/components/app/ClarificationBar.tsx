"use client";

import { HelpCircle } from "lucide-react";
import type { PendingClarification } from "@/lib/chat-api";

export function ClarificationBar({
  pending,
  busy,
  onYes,
  onNo,
  className = "",
}: {
  pending: PendingClarification;
  busy?: boolean;
  onYes: () => void;
  onNo: () => void;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-labelledby="clarification-title"
      className={`rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/10 p-5 shadow-[4px_4px_0_var(--hero-ink)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/25 text-[var(--hero-mint)]">
          <HelpCircle className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id="clarification-title"
            className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/50"
          >
            Confirm intent
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--hero-ink)]">
            {pending.question}
          </p>
          {pending.plan_preview ? (
            <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--hero-ink)]/15 bg-white/70 p-3 font-mono text-xs text-[var(--hero-ink)]/70">
              {pending.plan_preview}
            </pre>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onYes}
              className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-5 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition hover:translate-y-px hover:shadow-[1px_1px_0_var(--hero-ink)] disabled:opacity-50"
            >
              Yes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onNo}
              className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-5 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition hover:translate-y-px hover:shadow-[1px_1px_0_var(--hero-ink)] disabled:opacity-50"
            >
              No
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
