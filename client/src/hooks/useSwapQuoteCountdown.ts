"use client";

import { useEffect, useState } from "react";

export type QuoteCountdownState =
  | { status: "none" }
  | { status: "active"; remainingMs: number; label: string }
  | { status: "expired" };

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function useSwapQuoteCountdown(
  quoteExpiresAt: string | null | undefined,
): QuoteCountdownState {
  const [state, setState] = useState<QuoteCountdownState>({ status: "none" });

  useEffect(() => {
    if (!quoteExpiresAt) {
      setState({ status: "none" });
      return;
    }

    const tick = () => {
      const remainingMs = new Date(quoteExpiresAt).getTime() - Date.now();
      if (remainingMs <= 0) {
        setState({ status: "expired" });
        return;
      }
      setState({
        status: "active",
        remainingMs,
        label: formatRemaining(remainingMs),
      });
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [quoteExpiresAt]);

  return state;
}

export function resolveQuoteExpiresAt(pending: {
  quote_expires_at?: string | null;
  params?: Record<string, unknown>;
}): string | null {
  if (pending.quote_expires_at) {
    return pending.quote_expires_at;
  }
  const fromParams = pending.params?.quote_expires_at ?? pending.params?.expires_at;
  return typeof fromParams === "string" ? fromParams : null;
}
