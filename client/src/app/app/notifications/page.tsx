"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { NotificationEventRow } from "@/components/app/NotificationEventRow";
import { useNotifications } from "@/components/app/NotificationProvider";
import { SidebarToggle } from "@/components/app/Sidebar";
import { useNotificationEventsPage } from "@/hooks/useNotificationEventsPage";
import { formatDisplayNumber } from "@/lib/format-display-amount";
import {
  markNotificationEventRead,
  resolveNotificationDeepLink,
} from "@/lib/notifications-api";

const PAGE_SIZE = 20;

const FILTER_OPTIONS = [
  { value: "", label: "All notifications" },
  { value: "unread", label: "Unread only" },
] as const;

export default function NotificationsPage() {
  const router = useRouter();
  const { refreshUnreadCount } = useNotifications();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]["value"]>("");

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  const { items, pagination, loading, error, reload } = useNotificationEventsPage(
    filter === "unread" ? { unread: true } : {},
    page,
    PAGE_SIZE,
  );

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  async function handleOpen(eventId: string) {
    const event = items.find((row) => row.id === eventId);
    if (!event) return;

    if (event.unread) {
      try {
        await markNotificationEventRead(event.id);
        await refreshUnreadCount();
      } catch {
        // Still navigate if mark-read fails.
      }
    }

    const href = resolveNotificationDeepLink(event);
    if (href) {
      router.push(href);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <SidebarToggle />
          <div>
            <h1 className="flex items-center gap-2 font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
              <Bell className="size-7 text-[var(--hero-amber)]" strokeWidth={2.5} />
              Notifications
            </h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
              Alerts from your apps, scheduled reminders, and agent-driven rules — all in one place.
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

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
            Show
          </span>
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as (typeof FILTER_OPTIONS)[number]["value"]);
              setPage(1);
            }}
            className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2 text-xs font-bold"
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Link
          href="/app/settings"
          className="text-xs font-bold text-[var(--hero-ink)]/60 underline-offset-2 hover:underline"
        >
          Notification preferences
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--hero-coral)]">{error}</p>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-[var(--hero-ink)]/45">
          <Loader2 className="size-5 animate-spin" />
          Loading notifications…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-white px-5 py-12 text-center shadow-[4px_4px_0_var(--hero-ink)]">
          <p className="font-heading text-lg font-extrabold text-[var(--hero-ink)]/70">
            No notifications yet
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/45">
            Alerts from your apps and agent will show up here when something matches your rules.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((event) => (
            <li key={event.id}>
              <NotificationEventRow event={event} onSelect={(row) => void handleOpen(row.id)} />
            </li>
          ))}
        </ul>
      )}

      {pagination.total > 0 ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[var(--hero-ink)]/45">
            Page {formatDisplayNumber(pagination.page, { maxFractionDigits: 0 })} of{" "}
            {formatDisplayNumber(totalPages, { maxFractionDigits: 0 })} ·{" "}
            {formatDisplayNumber(pagination.total, { maxFractionDigits: 0 })} total
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
    </div>
  );
}
