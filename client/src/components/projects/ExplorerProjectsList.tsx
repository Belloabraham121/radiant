"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, TrendingUp } from "lucide-react";
import { fetchPublicApps, listingToAgent } from "@/lib/apps-api";
import {
  fmt,
  getAgentReputation,
  makeSeries,
  trendingScore,
  type Agent,
  type AgentCategory,
} from "@/lib/explorer-data";
import { InstallAppButton } from "@/components/explorer/InstallAppButton";
import { Sparkline } from "@/components/explorer/Charts";
import { ReputationBadge } from "@/components/explorer/ReputationBadge";
import { matchesSearch } from "./projects-hub-types";

const CATEGORIES: ("all" | AgentCategory)[] = [
  "all",
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

export function ExplorerProjectsList({ search }: { search: string }) {
  const [category, setCategory] = useState<"all" | AgentCategory>("all");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchPublicApps({
      category: category === "all" ? undefined : category,
      search: search.trim() || undefined,
      sort: "newest",
    })
      .then((catalog) => {
        if (cancelled) return;
        const mapped = catalog.apps.map(listingToAgent);
        setAgents(mapped);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load public apps");
          setAgents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, search]);

  const displayAgents = agents.filter(
    (agent) =>
      !search.trim() ||
      matchesSearch(agent.name, search) ||
      matchesSearch(agent.tagline, search) ||
      matchesSearch(agent.category, search) ||
      matchesSearch(agent.creator, search),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-[var(--hero-ink)]/45">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading public apps…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-full border-2 border-[var(--hero-ink)] px-3.5 py-1.5 text-xs font-bold transition-all ${
              category === cat
                ? "bg-[var(--hero-ink)] text-[var(--hero-bg)] shadow-[2px_2px_0_var(--hero-amber)]"
                : "bg-white text-[var(--hero-ink)] hover:-translate-y-0.5"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {error ? <p className="mb-6 text-sm font-semibold text-red-700">{error}</p> : null}

      {displayAgents.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/15 p-8 text-center text-sm font-semibold text-[var(--hero-ink)]/50">
          No public apps match your search. Try another keyword or category.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayAgents.map((agent) => {
            const reputation = getAgentReputation(agent);
            const isTrending = trendingScore(agent) > 800;

            return (
              <article
                key={agent.id}
                className="flex flex-col gap-4 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-lg font-extrabold text-white"
                    style={{ backgroundColor: agent.accent }}
                  >
                    {agent.name[0]}
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isTrending ? (
                      <span className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b97700]">
                        <TrendingUp className="size-3" />
                        hot
                      </span>
                    ) : null}
                    <ReputationBadge reputation={reputation} />
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-xl font-extrabold tracking-tight">
                      {agent.name}
                    </h3>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                      style={{ backgroundColor: agent.accent }}
                    >
                      {agent.category}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
                    {agent.tagline}
                  </p>
                </div>

                <Sparkline
                  data={makeSeries(agent.id, agent.txCount / 40, agent.txCount / 80)}
                  accent={agent.accent}
                />

                <div className="flex items-center justify-between border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-3 text-xs font-bold">
                  <span className="text-[var(--hero-ink)]/45">{fmt(agent.txCount)} txs</span>
                  <span className="text-[var(--hero-ink)]/45">{fmt(agent.volumeSui)} SUI vol</span>
                  <span style={{ color: agent.accent }}>
                    {agent.feeBps === 0 ? "free" : `${agent.feeBps / 100}% fee`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <InstallAppButton projectId={agent.id} accent={agent.accent} label="Install" />
                  <Link
                    href={`/explorer/${agent.id}`}
                    className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)]/20 px-4 py-3 text-xs font-bold text-[var(--hero-ink)]/70 hover:border-[var(--hero-ink)]/40"
                  >
                    Details
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
