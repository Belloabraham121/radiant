"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { AGENTS, getAgentReputation, makeSeries, makeTxs } from "@/lib/explorer-data";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { CountUp } from "@/components/explorer/CountUp";
import { AreaChart, BarChart } from "@/components/explorer/Charts";
import { ReputationBadge } from "@/components/explorer/ReputationBadge";
import { TxTable } from "@/components/explorer/TxTable";

export function ExplorerAppDetail({ projectId }: { projectId: string }) {
  const agent = AGENTS.find((entry) => entry.id === projectId);
  if (!agent) {
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
                {agent.name.slice(0, 1)}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/45">
                  {agent.category}
                </p>
                <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
                  {agent.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium text-[var(--hero-ink)]/65">
                  {agent.tagline}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ReputationBadge reputation={reputation} />
              <Link
                href="/app"
                className="inline-flex items-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-5 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
              >
                Open in chat
              </Link>
            </div>
          </div>

          <p className="mt-6 max-w-3xl text-sm font-medium leading-relaxed text-[var(--hero-ink)]/70">
            {agent.description}
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white/60 px-4 py-5 shadow-[3px_3px_0_var(--hero-ink)]"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/45">
                {stat.label}
              </p>
              <p className="mt-2 font-heading text-2xl font-extrabold">
                <CountUp value={stat.value} />
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
      </main>
    </div>
  );
}
