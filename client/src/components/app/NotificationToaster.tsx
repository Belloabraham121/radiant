"use client";

import { Toaster } from "sonner";

const toastBase =
  "group w-full max-w-sm rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-4 py-3 shadow-[4px_4px_0_var(--hero-ink)] text-[var(--hero-ink)]";

export function NotificationToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      visibleToasts={4}
      expand
      gap={10}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: toastBase,
          title: "text-sm font-bold text-[var(--hero-ink)]",
          description: "text-xs font-medium leading-relaxed text-[var(--hero-ink)]/65",
          actionButton:
            "rounded-lg border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-3 py-1.5 text-xs font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5",
          closeButton:
            "left-auto right-0 top-3 !border-2 !border-[var(--hero-ink)] !bg-[var(--hero-bg)] !text-[var(--hero-ink)]",
        },
      }}
    />
  );
}

export function notificationToastClassName(
  severity?: "info" | "warning" | "critical",
): string | undefined {
  if (severity === "critical") {
    return `${toastBase} !bg-[color-mix(in_srgb,var(--hero-coral)_18%,white)]`;
  }
  if (severity === "warning") {
    return `${toastBase} !bg-[color-mix(in_srgb,var(--hero-amber)_22%,white)]`;
  }
  return toastBase;
}
