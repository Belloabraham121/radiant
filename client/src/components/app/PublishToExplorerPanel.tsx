"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import type { AgentCategory } from "@/lib/explorer-data";
import {
  fetchPublishState,
  publishProject,
  type PublishState,
} from "@/lib/apps-api";

const CATEGORIES: AgentCategory[] = [
  "swap",
  "payments",
  "automation",
  "savings",
  "markets",
  "escrow",
  "alerts",
  "offramp",
  "staking",
  "portfolio",
];

export function PublishToExplorerPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<PublishState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState(0);
  const [category, setCategory] = useState<AgentCategory>("payments");
  const [tagline, setTagline] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchPublishState(projectId)
      .then((data) => {
        if (cancelled) return;
        setState(data);
        setFeeBps(data.fee_bps);
        setCategory((data.category as AgentCategory) || "payments");
        setTagline(data.tagline);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load publish settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function togglePublish(isPublic: boolean) {
    if (!state?.can_publish && isPublic) {
      setError("Save a live artifact before publishing to the explorer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await publishProject(projectId, {
        is_public: isPublic,
        fee_bps: feeBps,
        category,
        tagline,
      });
      setState(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-[var(--hero-ink)]/45">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading explorer settings…
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className="mt-8 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[4px_4px_0_var(--hero-ink)]">
      <div className="flex items-start gap-3">
        <Globe className="mt-0.5 size-5 text-[var(--hero-blue)]" strokeWidth={2.5} />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-extrabold tracking-tight">Explorer listing</h2>
          <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
            Let other Radiant users install and run this app inside their account — not as an
            external link.
          </p>
        </div>
        {state.is_public ? (
          <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
            listed
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="block text-xs font-bold uppercase tracking-wide text-[var(--hero-ink)]/45">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as AgentCategory)}
            className="mt-1.5 w-full rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-3 py-2 text-sm font-semibold"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wide text-[var(--hero-ink)]/45">
          Fee (bps)
          <input
            type="number"
            min={0}
            max={1000}
            value={feeBps}
            onChange={(e) => setFeeBps(Number(e.target.value))}
            className="mt-1.5 w-full rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-3 py-2 text-sm font-semibold"
          />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wide text-[var(--hero-ink)]/45 sm:col-span-1">
          Tagline
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Short listing description"
            className="mt-1.5 w-full rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-3 py-2 text-sm font-semibold"
          />
        </label>
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {state.is_public ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void togglePublish(false)}
            className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-5 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            Remove from explorer
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || !state.can_publish}
            onClick={() => void togglePublish(true)}
            className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-5 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-violet)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            Publish to explorer
          </button>
        )}
        {state.is_public ? (
          <a
            href={`/explorer/${projectId}`}
            className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-5 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5"
          >
            View listing
          </a>
        ) : null}
      </div>
    </div>
  );
}
