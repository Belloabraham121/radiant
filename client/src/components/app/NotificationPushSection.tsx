"use client";

import { Bell, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchPushConfig,
  isWebPushSupported,
  listPushSubscriptions,
  subscribeWebPush,
  unsubscribeWebPush,
  type PushSubscriptionRecord,
} from "@/lib/notifications-api";

export function NotificationPushSection() {
  const [supported, setSupported] = useState(false);
  const [enabledOnServer, setEnabledOnServer] = useState(false);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const browserSupported = isWebPushSupported();
      setSupported(browserSupported);
      if (!browserSupported) {
        setSubscriptions([]);
        setEnabledOnServer(false);
        return;
      }

      const config = await fetchPushConfig();
      setEnabledOnServer(config.enabled);
      if (!config.enabled) {
        setSubscriptions([]);
        return;
      }

      const rows = await listPushSubscriptions();
      setSubscriptions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load push settings");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const browserSupported = isWebPushSupported();
        if (cancelled) return;
        setSupported(browserSupported);
        if (!browserSupported) {
          setSubscriptions([]);
          setEnabledOnServer(false);
          return;
        }

        const config = await fetchPushConfig();
        if (cancelled) return;
        setEnabledOnServer(config.enabled);
        if (!config.enabled) {
          setSubscriptions([]);
          return;
        }

        const rows = await listPushSubscriptions();
        if (cancelled) return;
        setSubscriptions(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load push settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribed = subscriptions.length > 0;

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeWebPush();
      if (!result.subscribed) {
        setError("Browser notifications were not enabled.");
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable push notifications");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    const current = subscriptions[0];
    if (!current) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await unsubscribeWebPush(current.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable push notifications");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-settings-block className="mt-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
        Alerts
      </h2>

      <div className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 shadow-[3px_3px_0_var(--hero-ink)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/30 p-2">
            <Bell className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Browser notifications</p>
            <p className="mt-1 text-xs font-medium text-[var(--hero-ink)]/55">
              Get alerts when something important happens while this tab is closed. We only ask
              after you opt in here.
            </p>

            {loading ? (
              <p className="mt-4 flex items-center gap-2 text-xs font-medium text-[var(--hero-ink)]/50">
                <Loader2 className="size-3.5 animate-spin" />
                Loading push settings…
              </p>
            ) : !supported ? (
              <p className="mt-4 text-xs font-medium text-[var(--hero-ink)]/50">
                This browser does not support Web Push.
              </p>
            ) : !enabledOnServer ? (
              <p className="mt-4 text-xs font-medium text-[var(--hero-ink)]/50">
                Push is not configured on this server yet.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || (subscribed && subscriptions.length === 0)}
                  onClick={subscribed ? handleDisable : handleEnable}
                  className="rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-4 py-2 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? "Saving…" : subscribed ? "Disable browser alerts" : "Enable browser alerts"}
                </button>
                {subscribed ? (
                  <span className="text-xs font-medium text-[var(--hero-ink)]/50">
                    Active on this browser
                  </span>
                ) : null}
              </div>
            )}

            {error ? (
              <p className="mt-3 text-xs font-medium text-red-600">{error}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
