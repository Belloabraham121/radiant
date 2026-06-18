"use client";

import { Bell, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  deleteNotificationRule,
  fetchProjectNotificationSchema,
  listNotificationRules,
  type NotificationRuleRecord,
  type ProjectNotificationSchema,
} from "@/lib/notifications-api";

type NotificationAppAlertsSectionProps = {
  projectId: string;
  installationId?: string;
  compact?: boolean;
};

export function NotificationAppAlertsSection({
  projectId,
  installationId,
  compact = false,
}: NotificationAppAlertsSectionProps) {
  const [open, setOpen] = useState(!compact);
  const [schema, setSchema] = useState<ProjectNotificationSchema | null>(null);
  const [rules, setRules] = useState<NotificationRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [schemaResult, rulesResult] = await Promise.all([
        fetchProjectNotificationSchema(projectId),
        listNotificationRules({
          project_id: installationId ? undefined : projectId,
          installation_id: installationId,
          status: "active",
          limit: 50,
        }),
      ]);
      setSchema(schemaResult.schema);
      setRules(rulesResult.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load app alerts");
    }
  }, [projectId, installationId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchProjectNotificationSchema(projectId),
      listNotificationRules({
        project_id: installationId ? undefined : projectId,
        installation_id: installationId,
        status: "active",
        limit: 50,
      }),
    ])
      .then(([schemaResult, rulesResult]) => {
        if (cancelled) return;
        setSchema(schemaResult.schema);
        setRules(rulesResult.rules);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load app alerts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, installationId]);

  async function handleDelete(ruleId: string) {
    setBusyId(ruleId);
    setError(null);
    setLoading(true);
    try {
      await deleteNotificationRule(ruleId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove alert");
    } finally {
      setBusyId(null);
      setLoading(false);
    }
  }

  if (!loading && !schema?.types.length && rules.length === 0) {
    return null;
  }

  return (
    <section className={compact ? "" : "mt-4 px-4"}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-4 py-3 text-left shadow-[3px_3px_0_var(--hero-ink)] ${
          compact ? "" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <Bell className="size-4" strokeWidth={2.5} />
          <span className="text-sm font-bold">App alerts</span>
          {rules.length > 0 ? (
            <span className="rounded-full bg-[var(--hero-amber)] px-2 py-0.5 text-[10px] font-bold">
              {rules.length}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>

      {open ? (
        <div className="mt-3 rounded-2xl border-2 border-[var(--hero-ink)]/15 bg-white px-4 py-3">
          {loading ? (
            <p className="flex items-center gap-2 text-xs font-medium text-[var(--hero-ink)]/50">
              <Loader2 className="size-3.5 animate-spin" />
              Loading alerts…
            </p>
          ) : null}

          {schema?.types.length ? (
            <p className="mb-3 text-xs font-medium text-[var(--hero-ink)]/55">
              Alert types: {schema.types.map((type) => type.label).join(", ")}. Configure rules in
              the app UI or ask the agent to set them up.
            </p>
          ) : (
            <p className="mb-3 text-xs font-medium text-[var(--hero-ink)]/55">
              This app has active alert rules but no declared notification schema yet.
            </p>
          )}

          {rules.length === 0 ? (
            <p className="text-xs font-medium text-[var(--hero-ink)]/50">No active alert rules.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--hero-ink)]/10 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {rule.label ?? rule.notification_type}
                    </p>
                    <p className="text-[11px] font-medium text-[var(--hero-ink)]/45">
                      {rule.trigger_kind}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === rule.id}
                    onClick={() => void handleDelete(rule.id)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)]/20 text-[var(--hero-coral)] hover:border-[var(--hero-ink)]"
                    aria-label="Remove alert"
                  >
                    <Trash2 className="size-3.5" strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="mt-3 text-xs font-medium text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
