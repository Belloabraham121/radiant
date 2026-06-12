"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { sanitizeRedirectPath } from "@/lib/privy-session";

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
      const token = await getAccessToken();
      if (token) {
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
