"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Redirects unauthenticated visitors away from /app/* (defense in depth with middleware). */
export function AuthenticatedGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/auth");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--hero-bg)] text-[var(--hero-ink)]">
        <Loader2 className="size-8 animate-spin text-[var(--hero-accent)]" aria-hidden />
        <p className="text-sm text-[var(--hero-muted)]">Loading your session…</p>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return children;
}
