"use client";

import {
  formatNotificationTime,
  type NotificationEventRecord,
} from "@/lib/notifications-api";

type NotificationEventRowProps = {
  event: NotificationEventRecord;
  onSelect?: (event: NotificationEventRecord) => void;
};

export function NotificationEventRow({ event, onSelect }: NotificationEventRowProps) {
  const severity = event.payload?.severity;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      className={`w-full rounded-2xl border-2 px-4 py-3 text-left transition-all hover:-translate-y-0.5 ${
        event.unread
          ? "border-[var(--hero-ink)] bg-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-ink)]"
          : "border-[var(--hero-ink)]/15 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-heading text-sm font-extrabold tracking-tight">{event.title}</p>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          {formatNotificationTime(event.created_at)}
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-[var(--hero-ink)]/60">{event.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {event.unread ? (
          <span className="rounded-full bg-[var(--hero-amber)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            New
          </span>
        ) : null}
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          {event.notification_type.replace(/_/g, " ")}
        </span>
        {severity === "critical" ? (
          <span className="rounded-full border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--hero-coral)]">
            Critical
          </span>
        ) : null}
      </div>
    </button>
  );
}
