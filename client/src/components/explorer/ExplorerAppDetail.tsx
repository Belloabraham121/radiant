"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { fetchPublicApp, listingToAgent } from "@/lib/apps-api";
import type { Agent } from "@/lib/explorer-data";
import { getAgentReputation, makeSeries, makeTxs } from "@/lib/explorer-data";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { CountUp } from "@/components/explorer/CountUp";
import { AreaChart, BarChart } from "@/components/explorer/Charts";
import { ReputationBadge, ReputationPanel } from "@/components/explorer/ReputationBadge";
import { TxTable } from "@/components/explorer/TxTable";
import { InstallAppButton } from "@/components/explorer/InstallAppButton";

export function ExplorerAppDetail({ projectId }: { projectId: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [availableActions, setAvailableActions] = useState<
    Array<{ name: string; description: string; category: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicApp(projectId)
      .then((listing) => {
        if (!cancelled) {
          setAgent(listingToAgent(listing));
          setAvailableActions(listing.available_actions ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="hero-selection flex min-h-screen items-center justify-center bg-[var(--hero-bg)]">
        <Loader2 className="size-6 animate-spin text-[var(--hero-ink)]/40" aria-hidden />
      </div>
    );
  }

  if (missing || !agent) {
    notFound();
  }

  const reputation = getAgentReputation(agent);

  const stats = [
    { label: "Transactions", value: agent.txCount },
    { label: "Volume (SUI)", value: agent.volumeSui },
    { label: "TVL (SUI)", value: agent.tvlSui },
    { label: "Fees earned (SUI)", value: agent.feesEarnedSui },
    { label: "Installs", value: agent.uses },
  ];

  return (
    <div className="hero-selection min-h-screen bg-[var(--hero-bg)] text-[var(--hero-ink)]">
      <ExplorerNav backTo={{ href: "/explorer", label: "All agents" }} />

      <main className="mx-auto max-w-7xl px-6 pb-28 md:px-12">
        <div
          className="mt-6 rounded-3xl border-2 border-[var(--hero-ink)] p-8 shadow-[6px_6px_0_var(--hero-ink)] md:p-12"
          style={{ backgroundColor: `${agent.accent}14` }}
        >
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-5">
              <span
                className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--hero-ink)] font-heading text-3xl font-extrabold text-white shadow-[3px_3px_0_var(--hero-ink)] md:size-20"
                style={{ backgroundColor: agent.accent }}
              >
                {agent.name[0]}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-5xl">
                    {agent.name}
                  </h1>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-bold text-white"
                    style={{ backgroundColor: agent.accent }}
                  >
                    {agent.category}
                  </span>
                  <ReputationBadge reputation={reputation} size="lg" />
                </div>
                <p className="mt-3 max-w-xl text-base font-medium leading-relaxed text-[var(--hero-ink)]/65">
                  {agent.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-[var(--hero-ink)]/45">
                  <span>
                    creator <span className="font-mono">{agent.creator}</span>
                  </span>
                  <span>published {agent.deployedAt}</span>
                  <span className="font-mono">{agent.walrusUrl}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-3">
              <InstallAppButton projectId={agent.id} accent={agent.accent} />
              <span className="text-center text-xs font-bold text-[var(--hero-ink)]/45">
                {agent.feeBps === 0 ? "free to use" : `${agent.feeBps / 100}% fee → creator`}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <ReputationPanel reputation={reputation} />
        </div>

        {availableActions.length > 0 ? (
          <div className="mt-10">
            <h2 className="font-heading text-xl font-extrabold tracking-tight">Available actions</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium text-[var(--hero-ink)]/60">
              Callable via chat after install — the agent reads this schema with{" "}
              <span className="font-mono">call_app_action</span>.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {availableActions.map((action) => (
                <li
                  key={action.name}
                  className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white p-4 shadow-[3px_3px_0_var(--hero-ink)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold">{action.name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                      style={{ backgroundColor: agent.accent }}
                    >
                      {action.category}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[var(--hero-ink)]/65">
                    {action.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 text-center shadow-[4px_4px_0_var(--hero-ink)]"
            >
              <CountUp
                value={stat.value}
                className="font-heading text-2xl font-extrabold tracking-tight md:text-3xl"
              />
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/45">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <BarChart
            data={makeSeries(`${agent.id}:txs`, agent.txCount / 35, agent.txCount / 70)}
            accent={agent.accent}
            label="Transactions per day"
          />
          <AreaChart
            data={makeSeries(`${agent.id}:vol`, agent.volumeSui / 32, agent.volumeSui / 60)}
            accent={agent.accent}
            label="Volume per day"
            unit=" SUI"
          />
        </div>

        <div className="mt-10">
          <TxTable txs={makeTxs(agent)} accent={agent.accent} />
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] text-[var(--hero-bg)] shadow-[6px_6px_0] [box-shadow:6px_6px_0_var(--hero-amber)]">
          <div className="flex items-center justify-between border-b border-[var(--hero-bg)]/15 px-6 py-4">
            <h3 className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
              <Sparkles className="size-4 text-[var(--hero-amber)]" strokeWidth={2.5} />
              Run inside Radiant
            </h3>
            <span className="rounded-full bg-[var(--hero-mint)]/20 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
              install
            </span>
          </div>
          <pre className="overflow-x-auto px-6 py-5 font-mono text-sm leading-relaxed text-[var(--hero-bg)]/85">
            {`POST /api/v1/apps/${agent.id}/install

→ Opens /app/installed/:installationId/run
→ Uses your agent wallet via installation APIs`}
          </pre>
          <div className="border-t border-[var(--hero-bg)]/15 px-6 py-4">
            <Link
              href={`/explorer/${agent.id}`}
              className="text-sm font-bold text-[var(--hero-amber)]"
            >
              Install from explorer →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
