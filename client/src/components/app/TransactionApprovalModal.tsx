"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import type { PendingTransaction } from "@/lib/chat-api";

export function TransactionApprovalModal({
  pending,
  busy,
  onApprove,
  onCancel,
}: {
  pending: PendingTransaction;
  busy?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--hero-ink)]/40 px-6 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-labelledby="tx-approval-title"
        className="w-full max-w-md rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[8px_8px_0_var(--hero-ink)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 text-[var(--hero-amber)]">
            <ShieldAlert className="size-5" strokeWidth={2.5} />
          </span>
          <div>
            <h2
              id="tx-approval-title"
              className="font-heading text-xl font-extrabold tracking-tight"
            >
              Approve transaction
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
              {pending.action === "swap" || pending.action === "deepbook_swap"
                ? "Review this swap quote, then approve to execute on chain."
                : "Review this transaction, then approve to sign and send."}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-3">
          <p className="text-sm font-bold">{pending.summary}</p>
          <p className="mt-1 font-mono text-xs font-semibold text-[var(--hero-ink)]/50">
            {pending.chain_id} · {pending.action}
          </p>
          <p className="mt-2 text-lg font-extrabold text-[var(--hero-ink)]">
            {pending.amount_display}
          </p>
          {(pending.action === "swap" || pending.action === "deepbook_swap") && (
            <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/45">
              Estimated output may vary with market movement. Slippage protection is applied on
              chain.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Approve & send
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex flex-1 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
