"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowLeft, ArrowUpRight, Bot, Globe, PartyPopper, Rocket } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { getProject } from "@/lib/app-data";
import { AGENTS, fmt, getAgent, makeSeries, makeTxs } from "@/lib/explorer-data";
import { CountUp } from "@/components/explorer/CountUp";
import { AreaChart, BarChart } from "@/components/explorer/Charts";
import { TxTable } from "@/components/explorer/TxTable";

gsap.registerPlugin(useGSAP);

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const project = getProject(id);
  const ref = useRef<HTMLDivElement>(null);
  const [justLaunched, setJustLaunched] = useState(false);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-proj-block]", {
        y: 28,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: "power3.out",
      });
    },
    { scope: ref },
  );

  if (!project) notFound();

  const agent = project.agentId ? getAgent(project.agentId) : undefined;
  const isLive = project.status === "live" || justLaunched;

  // agents on the network that call this app
  const callers = agent
    ? AGENTS.filter((a) => a.id !== agent.id)
        .slice(0, 3)
        .map((a, i) => ({ name: a.name, accent: a.accent, calls: Math.round(agent.uses / (3 + i * 2)) }))
    : [];

  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10">
      <div className="mb-6 flex items-center gap-3">
        <SidebarToggle />
        <Link
          href="/app/projects"
          className="flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--hero-ink)]/50 transition-colors hover:text-[var(--hero-ink)]"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} />
          All projects
        </Link>
      </div>

      {/* header */}
      <div
        data-proj-block
        className="rounded-3xl border-2 border-[var(--hero-ink)] p-8 shadow-[6px_6px_0_var(--hero-ink)]"
        style={{ backgroundColor: `${project.accent}14` }}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--hero-ink)] font-heading text-2xl font-extrabold text-white shadow-[3px_3px_0_var(--hero-ink)]"
              style={{ backgroundColor: project.accent }}
            >
              {project.name[0]}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
                  {project.name}
                </h1>
                {isLive ? (
                  <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
                    <Globe className="size-3.5" strokeWidth={2.5} />
                    live on Walrus
                  </span>
                ) : (
                  <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 px-3 py-1 text-xs font-bold text-[#b97700]">
                    draft
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--hero-ink)]/60">
                {project.tagline} · built in “{project.builtIn}”
              </p>
              {project.walrusUrl && (
                <p className="mt-2 font-mono text-xs font-semibold text-[var(--hero-ink)]/45">
                  {project.walrusUrl}
                </p>
              )}
            </div>
          </div>

          {isLive ? (
            <a
              href="#"
              className="group flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--hero-ink)] px-6 py-3 text-sm font-bold text-[var(--hero-bg)] transition-transform hover:-translate-y-1"
              style={{ boxShadow: `4px 4px 0 ${project.accent}` }}
            >
              Open app
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          ) : (
            <button
              onClick={() => setJustLaunched(true)}
              className="group flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--hero-ink)] px-6 py-3 text-sm font-bold text-[var(--hero-bg)] transition-transform hover:-translate-y-1"
              style={{ boxShadow: `4px 4px 0 ${project.accent}` }}
            >
              <Rocket className="size-4" strokeWidth={2.5} />
              Launch to Walrus
            </button>
          )}
        </div>
      </div>

      {justLaunched && (
        <div className="mt-6 flex items-center gap-3 rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-6 py-4 shadow-[4px_4px_0_var(--hero-ink)]">
          <PartyPopper className="size-6 text-[var(--hero-mint)]" strokeWidth={2.2} />
          <div>
            <p className="text-sm font-extrabold">It&apos;s alive!</p>
            <p className="text-xs font-medium text-[var(--hero-ink)]/55">
              Deployed to Walrus and listed on the explorer. Metrics start counting from the
              first visitor — share your link.
            </p>
          </div>
        </div>
      )}

      {agent ? (
        <>
          {/* metrics */}
          <div data-proj-block className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "People using it", value: agent.uses },
              { label: "Transactions", value: agent.txCount },
              { label: "Volume (SUI)", value: agent.volumeSui },
              { label: "Fees you earned (SUI)", value: agent.feesEarnedSui },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 text-center shadow-[4px_4px_0_var(--hero-ink)]"
              >
                <CountUp
                  value={stat.value}
                  className="font-heading text-2xl font-extrabold tracking-tight"
                />
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/45">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <div data-proj-block className="mt-8 grid gap-6 lg:grid-cols-2">
            <AreaChart
              data={makeSeries(`${agent.id}:users`, agent.uses / 28, agent.uses / 50)}
              accent={project.accent}
              label="Daily users"
            />
            <BarChart
              data={makeSeries(`${agent.id}:txs`, agent.txCount / 35, agent.txCount / 70)}
              accent={project.accent}
              label="Transactions per day"
            />
          </div>

          {/* agents connecting */}
          <div data-proj-block className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
              <Bot className="size-4" strokeWidth={2.5} />
              Agents calling your app
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {callers.map((caller) => (
                <div
                  key={caller.name}
                  className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)]"
                >
                  <span
                    className="mb-3 flex size-9 items-center justify-center rounded-lg border-2 border-[var(--hero-ink)] font-heading text-sm font-extrabold text-white"
                    style={{ backgroundColor: caller.accent }}
                  >
                    {caller.name[0]}
                  </span>
                  <p className="text-sm font-extrabold">{caller.name}</p>
                  <p className="text-xs font-bold text-[var(--hero-ink)]/45">
                    {fmt(caller.calls)} calls this month
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div data-proj-block className="mt-8 pb-10">
            <TxTable txs={makeTxs(agent)} accent={project.accent} />
          </div>
        </>
      ) : (
        <div data-proj-block className="mt-8 pb-10">
          <div className="rounded-3xl border-2 border-dashed border-[var(--hero-ink)]/30 p-10 text-center">
            <p className="font-heading text-xl font-extrabold tracking-tight">
              {isLive ? "Waiting for the first visitor…" : "No metrics yet"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
              {isLive
                ? "Users, transactions, volume and connected agents will show up here as soon as someone uses your app."
                : "Launch this app to Walrus and metrics will start flowing in — people using it, transactions, volume, and the agents that call it."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
