"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import {
  fetchNotificationPreferences,
  patchNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications-api";

function ToggleRow({
  label,
  detail,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  detail: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 text-left shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs font-medium text-[var(--hero-ink)]/50">{detail}</span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-[var(--hero-ink)] transition-colors ${
          on ? "bg-[var(--hero-mint)]" : "bg-[var(--hero-ink)]/10"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full border-2 border-[var(--hero-ink)] bg-white transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function NotificationPreferencesSection() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrefs(await fetchNotificationPreferences());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notification preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleToggleOpen() {
    setOpen((value) => {
      const next = !value;
      if (next && !prefs && !loading) {
        void load();
      }
      return next;
    });
  }

  async function save(patch: Partial<NotificationPreferences>) {
    if (!prefs) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchNotificationPreferences(patch);
      setPrefs(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save preferences");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-settings-block className="mt-10">
      <button
        type="button"
        onClick={handleToggleOpen}
        className="mb-4 flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
          Notification preferences
        </h2>
        <ChevronDown
          className={`size-4 text-[var(--hero-ink)]/40 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-3">
          {loading ? (
            <p className="flex items-center gap-2 text-xs font-medium text-[var(--hero-ink)]/50">
              <Loader2 className="size-3.5 animate-spin" />
              Loading preferences…
            </p>
          ) : null}

          {prefs ? (
            <>
              <ToggleRow
                label="Notifications enabled"
                detail="Master switch for in-app alerts and delivery."
                on={prefs.enabled}
                disabled={busy}
                onToggle={() => void save({ enabled: !prefs.enabled })}
              />

              <label className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 shadow-[3px_3px_0_var(--hero-ink)]">
                <span className="block text-sm font-bold">Timezone</span>
                <span className="mt-1 block text-xs font-medium text-[var(--hero-ink)]/50">
                  Used for quiet hours and scheduled reminders.
                </span>
                <input
                  type="text"
                  value={prefs.timezone}
                  disabled={busy}
                  onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
                  onBlur={() => void save({ timezone: prefs.timezone })}
                  className="mt-3 w-full rounded-xl border-2 border-[var(--hero-ink)]/20 px-3 py-2 text-sm font-medium"
                  placeholder="America/New_York"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 shadow-[3px_3px_0_var(--hero-ink)]">
                  <span className="block text-sm font-bold">Quiet hours start</span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_start ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setPrefs({ ...prefs, quiet_hours_start: e.target.value || null })
                    }
                    onBlur={() => void save({ quiet_hours_start: prefs.quiet_hours_start })}
                    className="mt-3 w-full rounded-xl border-2 border-[var(--hero-ink)]/20 px-3 py-2 text-sm font-medium"
                  />
                </label>
                <label className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 shadow-[3px_3px_0_var(--hero-ink)]">
                  <span className="block text-sm font-bold">Quiet hours end</span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_end ?? ""}
                    disabled={busy}
                    onChange={(e) => setPrefs({ ...prefs, quiet_hours_end: e.target.value || null })}
                    onBlur={() => void save({ quiet_hours_end: prefs.quiet_hours_end })}
                    className="mt-3 w-full rounded-xl border-2 border-[var(--hero-ink)]/20 px-3 py-2 text-sm font-medium"
                  />
                </label>
              </div>

              <label className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 shadow-[3px_3px_0_var(--hero-ink)]">
                <span className="block text-sm font-bold">Max notifications per hour</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={prefs.max_per_hour}
                  disabled={busy}
                  onChange={(e) =>
                    setPrefs({ ...prefs, max_per_hour: Number(e.target.value) || prefs.max_per_hour })
                  }
                  onBlur={() => void save({ max_per_hour: prefs.max_per_hour })}
                  className="mt-3 w-full rounded-xl border-2 border-[var(--hero-ink)]/20 px-3 py-2 text-sm font-medium"
                />
              </label>
            </>
          ) : null}

          {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
