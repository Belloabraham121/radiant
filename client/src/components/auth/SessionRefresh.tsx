"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { sanitizeRedirectPath } from "@/lib/privy-session";

const REFRESH_LOOP_STORAGE_KEY = "radiant:session-refresh-attempts";
const MAX_REFRESH_ATTEMPTS = 3;
const REFRESH_WINDOW_MS = 60_000;

function trackRefreshAttempt(): number {
  if (typeof sessionStorage === "undefined") {
    return 1;
  }

  const now = Date.now();
  const raw = sessionStorage.getItem(REFRESH_LOOP_STORAGE_KEY);
  let state = raw
    ? (JSON.parse(raw) as { count: number; startedAt: number })
    : { count: 0, startedAt: now };

  if (now - state.startedAt > REFRESH_WINDOW_MS) {
    state = { count: 0, startedAt: now };
  }

  state.count += 1;
  sessionStorage.setItem(REFRESH_LOOP_STORAGE_KEY, JSON.stringify(state));
  return state.count;
}

function clearRefreshAttempts(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(REFRESH_LOOP_STORAGE_KEY);
  }
}

/**
 * Privy cookie refresh flow — call `getAccessToken()` when `privy-token` expired
 * but `privy-session` is still present (see Privy SSR cookie docs).
 */
export function SessionRefresh() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, getAccessToken } = usePrivy();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready || startedRef.current) {
      return;
    }
    startedRef.current = true;

    const redirectUri = sanitizeRedirectPath(searchParams.get("redirect_uri"));

    void (async () => {
      const attempts = trackRefreshAttempt();
      if (attempts > MAX_REFRESH_ATTEMPTS) {
        clearRefreshAttempts();
        router.replace("/auth");
        return;
      }

      const token = await getAccessToken();
      if (token) {
        clearRefreshAttempts();
        router.replace(redirectUri);
        return;
      }
      router.replace("/auth");
    })();
  }, [getAccessToken, ready, router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--hero-bg)] text-[var(--hero-ink)]">
      <Loader2 className="size-8 animate-spin text-[var(--hero-accent)]" aria-hidden />
      <p className="text-sm text-[var(--hero-muted)]">Refreshing your session…</p>
    </div>
  );
}
