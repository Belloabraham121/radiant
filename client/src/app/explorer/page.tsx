import type { Metadata } from "next";
import { NETWORK, makeSeries } from "@/lib/explorer-data";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { CountUp } from "@/components/explorer/CountUp";
import { AreaChart, BarChart } from "@/components/explorer/Charts";
import { AgentGrid } from "@/components/explorer/AgentGrid";

export const metadata: Metadata = {
  title: "Agent Explorer — Radiant",
  description:
    "Every agent listed on Radiant: live, permanent, callable. Browse transactions, volume, and TVL across the network.",
};

const STATS = [
  { label: "Agents listed", value: NETWORK.totalAgents, accent: "var(--hero-coral)" },
  { label: "Total transactions", value: NETWORK.totalTxs, accent: "var(--hero-blue)" },
  { label: "Volume (SUI)", value: NETWORK.totalVolumeSui, accent: "var(--hero-mint)" },
  { label: "TVL (SUI)", value: NETWORK.totalTvlSui, accent: "var(--hero-violet)" },
  { label: "Creator fees (SUI)", value: NETWORK.totalFeesSui, accent: "var(--hero-amber)" },
];

export default function ExplorerPage() {
  return (
    <div className="hero-selection min-h-screen bg-[var(--hero-bg)] text-[var(--hero-ink)]">
      <ExplorerNav backTo={{ href: "/", label: "Home" }} />

      <main className="mx-auto max-w-7xl px-6 pb-28 md:px-12">
        {/* header */}
        <div className="pt-10 text-center md:pt-16">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/40">
            The agent explorer
          </p>
          <h1 className="mx-auto max-w-3xl font-heading text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
            Every agent.
            <br />
            <span className="inline-block -rotate-1 rounded-2xl bg-[var(--hero-mint)] px-4 pb-1 text-white shadow-[4px_4px_0_var(--hero-ink)]">
              Working onchain.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base font-medium leading-relaxed text-[var(--hero-ink)]/60 md:text-lg">
            Live, permanent, callable apps built by Radiant users. Watch them transact, see what
            they earn, call them from your own agent.
          </p>
        </div>

        {/* network stats */}
        <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-5">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 text-center shadow-[4px_4px_0_var(--hero-ink)]"
            >
              <CountUp
                value={stat.value}
                className="font-heading text-2xl font-extrabold tracking-tight md:text-3xl"
              />
              <p
                className="mt-1 text-xs font-bold uppercase tracking-[0.12em]"
                style={{ color: stat.accent }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* network charts */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <AreaChart
            data={makeSeries("network:txs", 1900, 420)}
            accent="#3865ff"
            label="Daily transactions"
          />
          <BarChart
            data={makeSeries("network:tvl", 14800, 2600)}
            accent="#00c478"
            label="Network TVL"
            unit=" SUI"
          />
        </div>

        {/* agents */}
        <div className="mt-24">
          <h2 className="mb-10 text-center font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
            Browse agents
          </h2>
          <AgentGrid />
        </div>
      </main>
    </div>
  );
}
