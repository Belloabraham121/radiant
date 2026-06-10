"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AGENTS, fmt, type Agent } from "@/lib/explorer-data";
import { WordReveal } from "./WordReveal";

const ROW_A = AGENTS.slice(0, 6);
const ROW_B = AGENTS.slice(6, 12);

function Card({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/explorer/${agent.id}`}
      className="flex w-72 shrink-0 flex-col gap-3 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)] transition-transform duration-300 hover:-translate-y-1.5"
    >
      <div className="flex items-center justify-between">
        <span
          className="rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{ backgroundColor: agent.accent }}
        >
          {agent.category}
        </span>
        <span className="text-xs font-bold text-[var(--hero-ink)]/45">
          {fmt(agent.uses)} uses
        </span>
      </div>
      <h3 className="font-heading text-xl font-extrabold tracking-tight">{agent.name}</h3>
      <div className="flex items-center justify-between text-sm font-bold">
        <span style={{ color: agent.accent }}>
          {agent.feeBps === 0 ? "free" : `${agent.feeBps / 100}% fee`}
        </span>
        <span className="text-[var(--hero-ink)]/45">→ creator&apos;s wallet</span>
      </div>
    </Link>
  );
}

function Row({ agents, reverse }: { agents: Agent[]; reverse?: boolean }) {
  const list = [...agents, ...agents];
  return (
    <div className="overflow-hidden">
      <div
        className={`flex w-max gap-6 pr-6 ${reverse ? "hero-marquee-reverse" : "hero-marquee-slow"}`}
      >
        {list.map((agent, i) => (
          <Card key={`${agent.id}-${i}`} agent={agent} />
        ))}
      </div>
    </div>
  );
}

export function ExplorerSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--hero-bg)] py-28 text-[var(--hero-ink)] md:py-40">
      <div className="mx-auto max-w-6xl px-6">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/40">
          The explorer
        </p>
        <WordReveal
          text="Built once. Earning forever."
          className="mx-auto max-w-3xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
        />
        <p className="mx-auto mt-6 max-w-xl text-center text-base font-medium leading-relaxed text-[var(--hero-ink)]/65 md:text-lg">
          Every app on the explorer is live, permanent, and callable — by people and by other
          agents. Creators earn a fee on every single use.
        </p>
      </div>

      <div className="mt-16 flex flex-col gap-6">
        <Row agents={ROW_A} />
        <Row agents={ROW_B} reverse />
      </div>

      <div className="mt-16 flex justify-center">
        <Link
          href="/explorer"
          className="group flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-white px-8 py-4 text-base font-bold shadow-[5px_5px_0_var(--hero-violet)] transition-transform hover:-translate-y-1"
        >
          Browse the explorer
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
