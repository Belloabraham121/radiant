"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight, Search, TrendingUp } from "lucide-react";
import {
  AGENTS,
  fmt,
  getAgentReputation,
  makeSeries,
  searchAgents,
  trendingScore,
  type AgentCategory,
  type AgentSort,
} from "@/lib/explorer-data";
import { Sparkline } from "./Charts";
import { ReputationBadge } from "./ReputationBadge";

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

const SORT_OPTIONS: { id: AgentSort; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "reputation", label: "Top reputation" },
  { id: "volume", label: "Highest volume" },
  { id: "txs", label: "Most txs" },
  { id: "tvl", label: "Highest TVL" },
  { id: "users", label: "Most users" },
  { id: "newest", label: "Newest" },
  { id: "name", label: "A–Z" },
];

export function AgentGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<"all" | AgentCategory>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AgentSort>("trending");

  const agents = searchAgents(AGENTS, query, category, sort);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const cards = gsap.utils.toArray<HTMLElement>("[data-agent-card]");
      if (!cards.length || !ref.current) return;

      gsap.set(cards, { opacity: 1, y: 0, rotation: 0 });

      const tween = gsap.from(cards, {
        y: 28,
        duration: 0.5,
        stagger: 0.05,
        ease: "power3.out",
        paused: true,
      });

      const trigger = ScrollTrigger.create({
        trigger: ref.current,
        start: "top 88%",
        once: true,
        onEnter: () => tween.play(),
      });

      if (trigger.progress > 0) {
        tween.progress(1);
      }

      return () => {
        trigger.kill();
        tween.kill();
      };
    },
    { scope: ref, dependencies: [category, query, sort, agents.length] },
  );

  return (
    <div ref={ref}>
      {/* search + sort */}
      <div className="mx-auto mb-8 max-w-2xl">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--hero-ink)]/35"
            strokeWidth={2.5}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, categories, creators, registry ids…"
            className="w-full rounded-2xl border-2 border-[var(--hero-ink)] bg-white py-3.5 pl-12 pr-4 text-sm font-semibold shadow-[4px_4px_0_var(--hero-ink)] placeholder:text-[var(--hero-ink)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--hero-blue)]"
          />
        </label>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSort(opt.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] px-3.5 py-1.5 text-xs font-bold transition-all ${
                sort === opt.id
                  ? "bg-[var(--hero-ink)] text-[var(--hero-bg)] shadow-[2px_2px_0_var(--hero-amber)]"
                  : "bg-white hover:-translate-y-0.5"
              }`}
            >
              {opt.id === "trending" && <TrendingUp className="size-3.5" strokeWidth={2.5} />}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* category filter chips */}
      <div className="mb-10 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
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

      {agents.length === 0 ? (
        <p className="py-16 text-center text-sm font-semibold text-[var(--hero-ink)]/50">
          No agents match your search. Try another keyword or category.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const reputation = getAgentReputation(agent);
            const isTrending = sort === "trending" && trendingScore(agent) > 800;

            return (
              <Link
                key={agent.id}
                href={`/explorer/${agent.id}`}
                data-agent-card
                className="group flex flex-col gap-4 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 opacity-100 shadow-[5px_5px_0_var(--hero-ink)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[9px_9px_0_var(--hero-ink)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-lg font-extrabold text-white"
                    style={{ backgroundColor: agent.accent }}
                  >
                    {agent.name[0]}
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isTrending && (
                      <span className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b97700]">
                        <TrendingUp className="size-3" />
                        hot
                      </span>
                    )}
                    <ReputationBadge reputation={reputation} />
                    <ArrowUpRight className="size-5 text-[var(--hero-ink)]/30 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--hero-ink)]" />
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
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
