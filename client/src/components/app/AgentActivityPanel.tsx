"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { AgentTransactionDetailDialog } from "@/components/app/AgentTransactionDetailDialog";
import { AgentTransactionRow } from "@/components/app/AgentTransactionRow";
import { useAgentRecentTransactions } from "@/hooks/useAgentTransactions";

export function AgentActivityPanel() {
  const { items, loading, error, reload } = useAgentRecentTransactions(8);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <>
      <section data-settings-block className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
            <Activity className="size-4" strokeWidth={2.5} />
            Recent activity
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/app/activity"
              className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5"
            >
              View all
              <ArrowRight className="size-3.5" />
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => void reload()}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
          On-chain actions your agent initiated — swaps, transfers, DeepBook orders, and more.
        </p>

        {error ? (
          <div className="rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
            <p className="text-sm font-semibold text-[var(--hero-coral)]">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-2 text-sm font-bold text-[var(--hero-blue)] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="flex items-center gap-2 rounded-3xl border-2 border-[var(--hero-ink)] bg-white px-5 py-8 text-sm font-semibold text-[var(--hero-ink)]/45 shadow-[4px_4px_0_var(--hero-ink)]">
            <Loader2 className="size-5 animate-spin" />
            Loading activity…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-white px-5 py-8 text-center shadow-[4px_4px_0_var(--hero-ink)]">
            <p className="font-heading text-base font-extrabold text-[var(--hero-ink)]/70">
              No agent transactions yet
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/45">
              Ask your agent to swap, send tokens, or trade on DeepBook.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <AgentTransactionRow item={item} onSelect={openDetail} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AgentTransactionDetailDialog
        transactionId={selectedId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
