"use client";

import { useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { AgentTransactionDetailDialog } from "@/components/app/AgentTransactionDetailDialog";
import { AgentTransactionRow } from "@/components/app/AgentTransactionRow";
import {
  useAgentTransactionsPage,
  type AgentActivityFilters,
} from "@/hooks/useAgentTransactions";
import type {
  AgentTransactionCategory,
  AgentTransactionStatus,
} from "@/lib/agent-transactions-api";

const STATUS_OPTIONS: { value: "" | AgentTransactionStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failed" },
  { value: "pending_approval", label: "Awaiting approval" },
  { value: "submitted", label: "Submitted" },
  { value: "rejected", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

const CATEGORY_OPTIONS: { value: "" | AgentTransactionCategory; label: string }[] = [
  { value: "", label: "All categories" },
  { value: "swap", label: "Swap" },
  { value: "transfer", label: "Transfer" },
  { value: "deepbook_balance", label: "DeepBook balance" },
  { value: "deepbook_order", label: "Orders" },
  { value: "deepbook_cancel", label: "Cancels" },
  { value: "deepbook_modify", label: "Modifies" },
  { value: "deepbook_settled", label: "Settled" },
  { value: "other", label: "Other" },
];

const PAGE_SIZE = 20;

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AgentTransactionStatus | "">("");
  const [category, setCategory] = useState<AgentTransactionCategory | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filters: AgentActivityFilters = {
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  };

  const { items, pagination, loading, error, reload } = useAgentTransactionsPage(
    filters,
    page,
    PAGE_SIZE,
  );

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  const onFilterChange = (next: Partial<{ status: typeof status; category: typeof category }>) => {
    if (next.status !== undefined) setStatus(next.status);
    if (next.category !== undefined) setCategory(next.category);
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <SidebarToggle />
          <div>
            <h1 className="flex items-center gap-2 font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
              <Activity className="size-7 text-[var(--hero-amber)]" strokeWidth={2.5} />
              Activity
            </h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
              Every on-chain action your agent initiated — with status, amounts, and links back to
              chat.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void reload()}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
            Status
          </span>
          <select
            value={status}
            onChange={(event) =>
              onFilterChange({ status: event.target.value as AgentTransactionStatus | "" })
            }
            className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2 text-xs font-bold"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
            Category
          </span>
          <select
            value={category}
            onChange={(event) =>
              onFilterChange({ category: event.target.value as AgentTransactionCategory | "" })
            }
            className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2 text-xs font-bold"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--hero-coral)]">{error}</p>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-[var(--hero-ink)]/45">
          <Loader2 className="size-5 animate-spin" />
          Loading transactions…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-white px-5 py-12 text-center shadow-[4px_4px_0_var(--hero-ink)]">
          <p className="font-heading text-lg font-extrabold text-[var(--hero-ink)]/70">
            No transactions match
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/45">
            Try clearing filters or run a swap from chat.
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

      {pagination.total > 0 ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[var(--hero-ink)]/45">
            Page {pagination.page} of {totalPages} · {pagination.total} total
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              Next
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <AgentTransactionDetailDialog
        transactionId={selectedId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
