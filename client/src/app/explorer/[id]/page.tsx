import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Globe, Sparkles } from "lucide-react";
import { AGENTS, getAgent, makeSeries, makeTxs } from "@/lib/explorer-data";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { CountUp } from "@/components/explorer/CountUp";
import { AreaChart, BarChart } from "@/components/explorer/Charts";
import { TxTable } from "@/components/explorer/TxTable";

export function generateStaticParams() {
  return AGENTS.map((agent) => ({ id: agent.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const agent = getAgent(id);
  return {
    title: agent ? `${agent.name} — Radiant Explorer` : "Agent — Radiant Explorer",
    description: agent?.description,
  };
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) notFound();

  const stats = [
    { label: "Transactions", value: agent.txCount },
    { label: "Volume (SUI)", value: agent.volumeSui },
    { label: "TVL (SUI)", value: agent.tvlSui },
    { label: "Fees earned (SUI)", value: agent.feesEarnedSui },
    { label: "Unique users", value: agent.uses },
  ];

  return (
    <div className="hero-selection min-h-screen bg-[var(--hero-bg)] text-[var(--hero-ink)]">
      <ExplorerNav backTo={{ href: "/explorer", label: "All agents" }} />

      <main className="mx-auto max-w-7xl px-6 pb-28 md:px-12">
        {/* agent header */}
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
                </div>
                <p className="mt-3 max-w-xl text-base font-medium leading-relaxed text-[var(--hero-ink)]/65">
                  {agent.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-[var(--hero-ink)]/45">
                  <span>
                    creator <span className="font-mono">{agent.creator}</span>
                  </span>
                  <span>deployed {agent.deployedAt}</span>
                  <span className="flex items-center gap-1">
                    <Globe className="size-3.5" strokeWidth={2.5} />
                    <span className="font-mono">{agent.walrusUrl}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-3">
              <Link
                href="/auth"
                className="group flex items-center justify-center gap-2 rounded-full bg-[var(--hero-ink)] px-7 py-3.5 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0]
                transition-transform hover:-translate-y-1"
                style={{ boxShadow: `4px 4px 0 ${agent.accent}` }}
              >
                Use this agent
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <span className="text-center text-xs font-bold text-[var(--hero-ink)]/45">
                {agent.feeBps === 0 ? "free to use" : `${agent.feeBps / 100}% fee → creator`}
              </span>
            </div>
          </div>
        </div>

        {/* stats */}
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

        {/* charts */}
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

        {/* transactions */}
        <div className="mt-10">
          <TxTable txs={makeTxs(agent)} accent={agent.accent} />
        </div>

        {/* API box */}
        <div className="mt-10 overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] text-[var(--hero-bg)] shadow-[6px_6px_0] [box-shadow:6px_6px_0_var(--hero-amber)]">
          <div className="flex items-center justify-between border-b border-[var(--hero-bg)]/15 px-6 py-4">
            <h3 className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
              <Sparkles className="size-4 text-[var(--hero-amber)]" strokeWidth={2.5} />
              Call it from your own agent
            </h3>
            <span className="rounded-full bg-[var(--hero-mint)]/20 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
              API-first
            </span>
          </div>
          <pre className="overflow-x-auto px-6 py-5 font-mono text-sm leading-relaxed text-[var(--hero-bg)]/85">
            {`POST https://radiant.so/app/${agent.id}/call

{
  "action": "${agent.category === "swap" ? "swap" : "execute"}",
  "amount_sui": 100,
  "wallet": "0x…"
}`}
          </pre>
        </div>
      </main>
    </div>
  );
}
