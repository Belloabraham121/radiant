import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionRefresh } from "@/components/auth/SessionRefresh";

export const metadata: Metadata = {
  title: "Refreshing session — Radiant",
  robots: { index: false, follow: false },
};

export default function RefreshPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--hero-bg)] text-sm text-[var(--hero-muted)]">
          Loading…
        </div>
      }
    >
      <SessionRefresh />
    </Suspense>
  );
}
