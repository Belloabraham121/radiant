"use client";

import { Loader2, Route } from "lucide-react";
import type { LiquidityFallbackOffer } from "@/lib/cross-chain-fallback";
import { formatAmountDisplayText } from "@/lib/format-display-amount";

export function LiquidityFallbackDialog({
  offer,
  busy,
  error,
  onAccept,
  onReject,
  className = "",
}: {
  offer: LiquidityFallbackOffer;
  busy?: boolean;
  error?: string | null;
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}) {
  const routeLabel = `${offer.from_token} → ${offer.to_token}`;

  return (
    <div
      role="region"
      aria-labelledby="liquidity-fallback-title"
      className={`rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-blue)]/15 text-[var(--hero-blue)]">
          <Route className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id="liquidity-fallback-title"
            className="font-heading text-lg font-extrabold tracking-tight text-[var(--hero-ink)]"
          >
            {busy ? "Finding another route…" : "Check another route?"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--hero-ink)]/50">
            Li-Fi couldn&apos;t find liquidity for this transfer. Check another route provider?
          </p>
        </div>
        <span className="shrink-0 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-blue)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[var(--hero-blue)]">
          {busy ? "Loading" : "Route check"}
        </span>
      </div>

      <div className="mt-4 rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          Transfer
        </p>
        <p className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-[var(--hero-ink)]">
          {formatAmountDisplayText(routeLabel)}
        </p>
        <p className="mt-1 font-mono text-[10px] font-semibold text-[var(--hero-ink)]/45">
          {offer.from_chain_id} → {offer.to_chain_id}
        </p>
      </div>

      {error && !busy ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3 text-xs font-semibold text-[var(--hero-coral)]"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Loading route…" : "Yes"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="inline-flex flex-1 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          No
        </button>
      </div>
    </div>
  );
}
