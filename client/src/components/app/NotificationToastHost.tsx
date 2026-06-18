"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useNotifications } from "@/components/app/NotificationProvider";

export function NotificationToastHost() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border-2 border-(--hero-ink) px-4 py-3 shadow-[4px_4px_0_var(--hero-ink)] ${
            toast.severity === "critical" ? "bg-(--hero-coral)/15" : "bg-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{toast.title}</p>
              <p className="mt-1 text-xs font-medium text-(--hero-ink)/65">
                {toast.body}
              </p>
              {toast.deepLink ? (
                <Link
                  href={toast.deepLink}
                  className="mt-2 inline-block text-xs font-bold underline-offset-2 hover:underline"
                >
                  Open
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissToast(toast.id)}
              className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)]"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
