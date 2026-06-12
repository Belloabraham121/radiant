"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import type { PendingTransaction } from "@/lib/chat-api";

export function TransactionApprovalBar({
  pending,
  busy,
  onApprove,
  onCancel,
  className = "",
}: {
  pending: PendingTransaction;
  busy?: boolean;
  onApprove: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const isSwap = pending.action === "swap" || pending.action === "deepbook_swap";

  return (
    <div
      role="region"
      aria-labelledby="tx-approval-title"
      className={`rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 text-[var(--hero-amber)]">
          <ShieldAlert className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id="tx-approval-title"
            className="font-heading text-lg font-extrabold tracking-tight text-[var(--hero-ink)]"
          >
            {isSwap ? "Approve swap" : "Approve transaction"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--hero-ink)]/50">
            {isSwap
              ? "Review the quote, then approve to execute on chain."
              : "Review the details, then approve to sign and send."}
          </p>
        </div>
        <span className="shrink-0 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[var(--hero-amber)]">
          Pending
        </span>
      </div>

      <div className="mt-4 rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          {pending.summary}
        </p>
        <p className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-[var(--hero-ink)]">
          {pending.amount_display}
        </p>
        <p className="mt-1 font-mono text-[10px] font-semibold text-[var(--hero-ink)]/45">
          {pending.chain_id} · {pending.action}
        </p>
        {isSwap ? (
          <p className="mt-2 text-[10px] font-medium text-[var(--hero-ink)]/45">
            Estimated output may shift slightly before the transaction lands on chain.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Approve & send
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex flex-1 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
