"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight } from "lucide-react";
import { AGENTS, fmt, makeSeries, type AgentCategory } from "@/lib/explorer-data";
import { Sparkline } from "./Charts";

gsap.registerPlugin(ScrollTrigger, useGSAP);

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

export function AgentGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<"all" | AgentCategory>("all");

  const agents = category === "all" ? AGENTS : AGENTS.filter((a) => a.category === category);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-agent-card]", {
        y: 36,
        opacity: 0,
        rotation: () => gsap.utils.random(-3, 3),
        duration: 0.6,
        stagger: 0.06,
        ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 85%" },
      });
    },
    { scope: ref, dependencies: [category] },
  );

  return (
    <div ref={ref}>
      {/* category filter chips */}
      <div className="mb-10 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded-full border-2 border-[var(--hero-ink)] px-4 py-1.5 text-sm font-bold transition-all ${
              category === cat
                ? "bg-[var(--hero-ink)] text-[var(--hero-bg)] shadow-[2px_2px_0_var(--hero-amber)]"
                : "bg-white text-[var(--hero-ink)] hover:-translate-y-0.5"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <Link
            key={agent.id}
            href={`/explorer/${agent.id}`}
            data-agent-card
            className="group flex flex-col gap-4 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[9px_9px_0_var(--hero-ink)]"
          >
            <div className="flex items-start justify-between">
              <span
                className="flex size-11 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-lg font-extrabold text-white"
                style={{ backgroundColor: agent.accent }}
              >
                {agent.name[0]}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="rounded-full px-3 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: agent.accent }}
                >
                  {agent.category}
                </span>
                <ArrowUpRight className="size-5 text-[var(--hero-ink)]/30 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--hero-ink)]" />
              </span>
            </div>

            <div>
              <h3 className="font-heading text-xl font-extrabold tracking-tight">{agent.name}</h3>
              <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">{agent.tagline}</p>
            </div>

            <Sparkline data={makeSeries(agent.id, agent.txCount / 40, agent.txCount / 80)} accent={agent.accent} />

            <div className="flex items-center justify-between border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-3 text-xs font-bold">
              <span className="text-[var(--hero-ink)]/45">{fmt(agent.txCount)} txs</span>
              <span className="text-[var(--hero-ink)]/45">{fmt(agent.volumeSui)} SUI vol</span>
              <span style={{ color: agent.accent }}>
                {agent.feeBps === 0 ? "free" : `${agent.feeBps / 100}% fee`}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
